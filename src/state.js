import { Deferred } from 'class-deferred';
import Loc from './loc';
import { Queue, domDeferred, UiQueue, waitStyles, loadNode } from './wait';
import Diff from 'levenlistdiff';

const ROUTE = "route";
const READY = "ready";
const BUILD = "build";
const PATCH = "patch";
const SETUP = "setup";
const PAINT = "paint";
const CLOSE = "close";
const CATCH = "catch";
const FRAGMENT = "fragment";
const Stages = [ROUTE, READY, BUILD, PATCH, SETUP, PAINT, FRAGMENT, CATCH, CLOSE];
const NodeEvents = [BUILD, PATCH, SETUP, PAINT, FRAGMENT, CLOSE];

const runQueue = new Queue();
const uiQueue = new UiQueue();
const chainsMap = {};
const connects = new Map();

export default class State extends Loc {
	static Stages = Stages;
	static NodeEvents = NodeEvents;
	static state = new State();
	data = {};
	#stage;
	#chains = {};
	#emitter;
	#emitters;
	#referrer;

	constructor(loc) {
		super(loc);
		for (const name of Stages) this.#initChain(name);
	}

	format(loc) {
		return (new Loc(loc)).toString();
	}

	parse(str) {
		return new Loc(str);
	}

	copy() {
		const inst = new State(this);
		inst.#emitter = this.#emitter;
		inst.#referrer = this.#referrer;
		inst.#chains = this.#chains;
		inst.#stage = this.#stage;
		Object.assign(inst, this); // also copy extra properties
		return inst;
	}

	get stage() {
		return this.#stage;
	}

	get referrer() {
		return this.#referrer;
	}

	#rebind() {
		State.state = window.Page = this;
	}

	connect(listener, node) {
		const methods = [];
		if (!node) node = listener;
		let proto = listener.constructor;
		proto = proto === Object ? listener : proto.prototype;
		for (const name of Object.getOwnPropertyNames(proto)) {
			let all = false;
			let key = name;
			if (key.startsWith('handleAll') || key.startsWith('captureAll')) {
				key = key.replace('All', '');
				all = true;
			}
			if (key.startsWith('handle') && key != 'handleEvent') {
				methods.push([all ? window : node, name, key.slice(6).toLowerCase(), false]);
			} else if (name.startsWith('capture') && name != 'captureEvent') {
				methods.push([all ? window : node, name, key.slice(7).toLowerCase(), true]);
			}
		}

		for (const name of methods) {
			name[4] = e => {
				const chain = State.state.#chains[State.state.#stage];
				listener[name[1]](e, chain.state);
			};
			name[0].addEventListener(name[2], name[4], name[3]);
		}
		connects.set(listener, methods);

		for (const name of NodeEvents) {
			if (listener[name]) this.chain(name, listener);
		}
	}

	disconnect(listener) {
		for (const name of NodeEvents) {
			if (listener[name]) {
				this.unchain(name, listener);
			}
		}
		const methods = connects.get(listener);
		if (methods) {
			for (const name of methods) {
				name[0].removeEventListener(name[2], name[4], name[3]);
			}
			connects.delete(listener);
		}

		if (listener[CLOSE]) {
			// if setup, run close once
			const prox = state => {
				this.unchain(SETUP, prox);
				return listener[CLOSE](state);
			};
			this.chain(SETUP, prox);
		}
	}

	#prerender(ok) {
		const root = document.documentElement;
		if (ok === undefined) ok = root.dataset.prerender == 'true';
		else if (ok === true) root.setAttribute('data-prerender', 'true');
		else if (ok === false) root.removeAttribute('data-prerender');
		return ok;
	}

	run(opts) {
		this.#emitter = document.createElement('div');
		return runQueue.queue(() => this.#run(opts));
	}

	async #run(opts = {}) {
		this.#rebind();

		this.#stage = true;
		if (opts.data) Object.assign(this.data, opts.data);

		let samePathname = false;
		let sameQuery = false;
		let sameHash = false;

		const refer = this.#referrer;
		if (refer == this) {
			throw new Error("state and referrer should be distinct");
		}
		if (!refer) {
			sameHash = this.hash == '';
		} else {
			samePathname = this.samePathname(refer);
			if (samePathname) {
				sameQuery = this.sameQuery(refer);
				this.#emitter = refer.#emitter;
			}
			if (sameQuery) sameHash = this.sameHash(refer);
			refer.#emitters = new Set(document.head.querySelectorAll('script'));
		}

		await domDeferred();
		let prerendered = this.#prerender();
		// prerendered == referrer with same pathname/query
		// not prerendered == no referrer
		if (prerendered && !refer) {
			samePathname = true;
			// assumes full prerendering
			sameQuery = true;
		}

		let { vary } = opts;
		if (vary === true) {
			vary = BUILD;
		}
		if (vary == BUILD) {
			prerendered = sameHash = sameQuery = samePathname = false;
		} else if (vary == PATCH) {
			sameHash = sameQuery = false;
		} else if (vary == FRAGMENT) {
			sameHash = false;
		}

		try {
			if (!samePathname || !prerendered) {
				await this.runChain(ROUTE);
				if (this.doc && this.doc != document) {
					await this.#load(this.doc);
					prerendered = this.#prerender();
				}
				this.doc = document;
			}
			this.#prerender(true);
			await this.runChain(READY);

			if (!prerendered || !samePathname) {
				await this.runChain(BUILD);
			}
			if (!prerendered || !sameQuery) {
				await this.runChain(PATCH);
			}
			uiQueue.run(async () => {
				try {
					if (refer) window.removeEventListener('popstate', refer);
					window.addEventListener('popstate', this);
					await waitStyles();
					if (refer && !samePathname) {
						await refer.runChain(CLOSE);
					}
					if (!refer || !samePathname) {
						await this.runChain(SETUP);
					} else {
						await this.runChain(SETUP, true);
					}
					await this.runChain(PAINT);
					if (!sameHash) await this.runChain(FRAGMENT);
				} catch (err) {
					console.error(err);
				}
			});
		} catch(err) {
			this.error = err;
			await this.runChain(CATCH);
			const { error } = this;
			this.error = null;
			if (error) throw error;
		}
		return this;
	}

	#initChain(stage) {
		const chain = this.#chains[stage] = {};
		chain.started = false;
		chain.hold = new Deferred();
		chain.after = new Queue();
		// block after
		chain.after.queue(() => chain.hold);
		chain.current = new Queue();
		// unblock after when current.done is resolved
		chain.current.done.then(() => {
			chain.hold.resolve();
		});
		chain.done = chain.after.done.then(() => {
			Object.assign(this, chain.state);
			return this;
		});
		return chain;
	}

	#getChain(stage) {
		return this.#chains[stage] ?? this.#initChain(stage);
	}

	#startChain(stage) {
		const chain = this.#getChain(stage);
		this.#stage = stage;
		chain.state = this.copy();
		chain.started = true;
		return chain;
	}

	runChain(stage, future) {
		const chain = this.#startChain(stage);
		if (!future) {
			const e = new CustomEvent(`page${stage}`, {
				bubbles: true,
				cancelable: true,
				detail: chain
			});
			for (const node of (this.#emitters ?? document.head.querySelectorAll('script'))) {
				node.dispatchEvent(e);
			}
			if (this.#emitter) this.#emitter.dispatchEvent(e);
		}
		if (chain.current.length == 0) chain.hold.resolve();
		return chain.done;
	}


	async chain(stage, fn) {
		const chain = this.#getChain(stage);
		if (!fn) return chain.done;
		const stageMap = chainsMap[stage] ?? (chainsMap[stage] = new Map());

		let curem = document.currentScript;
		if (curem?.parentNode?.nodeName == "HEAD") {
			if (fn.parentNode && fn.parentNode.nodeName != "HEAD") curem = null;
		}
		const emitter = curem ?? this.#emitter;
		let lfn = stageMap.get(fn);
		if (!lfn) {
			lfn = {
				fn,
				run(e) {
					const chain = e.detail;
					const q = chain.current;
					if (lfn.fn) q.queue(() => {
						if (!q.stopped && lfn.fn) return chain.state.#runFn(lfn.fn);
					});
					return q;
				},
				emitters: new Set()
			};
			stageMap.set(fn, lfn);
		}
		if (!lfn.emitters.has(emitter)) {
			lfn.emitters.add(emitter);
			emitter.addEventListener('page' + stage, lfn.run);
		}
		if (!chain.started) {
			// pass
		} else if (chain.current.stopped) {
			await lfn.run({ detail: chain });
		} else {
			// not finished
			chain.current.queue(() => {
				return lfn.run({ detail: chain });
			});
		}
		return chain.done;
	}

	finish(fn) {
		const stage = this.#stage;
		if (!stage) throw new Error("Use state.finish inside a chain");
		const chain = this.#chains[stage];
		if (!chain) {
			console.warn("state.finish must be called from chain listener");
		} else {
			chain.after.queue(() => chain.state.#runFn(fn));
		}
		return this;
	}

	unchain(stage, fn) {
		const stageMap = chainsMap[stage];
		const lfn = stageMap?.get(fn);
		if (!lfn) return;
		stageMap.delete(fn);
		// the task in queue is not removed
		// yet the function is no longer called from the task
		for (const emitter of lfn.emitters) {
			emitter.removeEventListener('page' + stage, lfn.run);
		}
		// chain might have queued lfn.fn call
		lfn.fn = null;
	}

	async #runFn(fn) {
		const stage = this.#stage;
		const n = 'chain' + stage[0].toUpperCase() + stage.slice(1);
		const meth = fn?.[n] ?? fn?.[stage];
		// eslint-disable-next-line no-use-before-define
		try {
			if (meth && typeof meth == "function") {
				return await meth.call(fn, this);
			} else if (typeof fn == "function") {
				return await fn(this);
			} else {
				console.warn(stage, "function not found in", fn);
			}
		} catch (err) {
			console.error("Page." + stage, err);
		}
	}

	async #load(ndoc) {
		if (ndoc.ownerDocument) ndoc = ndoc.ownerDocument;
		if (!ndoc.documentElement) {
			throw new Error("Router expects documentElement");
		}
		const root = document.documentElement;
		const nroot = document.adoptNode(ndoc.documentElement);
		const nhead = nroot.querySelector('head');
		const nbody = nroot.querySelector('body');

		const selOn = 'script:not([type]),script[type="text/javascript"],script[type="module"],link[rel="stylesheet"]';
		const selOff = 'link[rel="none"],script[type="none"]';

		this.#updateAttributes(root, nroot);
		// disable all scripts and styles
		for (const node of nhead.querySelectorAll(selOn)) {
			const type = node.nodeName == "SCRIPT" ? 'type' : 'rel';
			if (node[type]) node.setAttribute('priv-' + type, node[type]);
			node[type] = 'none';
		}
		// previous styles are not removed immediately to avoid fouc
		const oldstyles = this.mergeHead(nhead);

		// preload and start styles
		const parallels = [];
		const serials = [];
		for (const node of document.head.querySelectorAll(selOff)) {
			const isScript = node.nodeName == "SCRIPT";
			const { src, as, cross } = isScript ? {
				src: node.getAttribute('src'),
				as: 'script',
				cross: node.crossOrigin != null ? 'crossorigin=' + node.crossOrigin : ''
			} : {
				src: node.getAttribute('href'),
				as: 'style',
				cross: ''
			};
			if (src && !src.startsWith('data:')) {
				// preload when in head
				node.insertAdjacentHTML('beforebegin',
					`<link rel="preload" href="${src}" as="${as}" ${cross}>`);
			}
			if (!isScript) {
				parallels.push(loadNode(node));
			} else {
				serials.push(node);
			}
		}
		await Promise.all(parallels);
		await this.mergeBody(nbody, document.body);
		for (const node of oldstyles) node.remove();
		// scripts must be run in order
		for (const node of serials) {
			await loadNode(node);
		}
	}

	mergeHead(node) {
		this.#updateAttributes(document.head, node);
		const from = document.head;
		const to = node;
		const collect = [];
		const list = Diff(from.children, to.children, child => {
			const url = child.src ?? child.href;
			const rel = child.rel == "none" ? "stylesheet" : child.rel;
			if (url) return `${child.nodeName}_${rel ?? ''}_${url}`;
			else return child.outerHTML;
		});
		for (const patch of list) {
			const ref = from.children[patch.index];
			switch (patch.type) {
				case Diff.INSERTION:
					from.insertBefore(patch.item, ref);
					break;
				case Diff.SUBSTITUTION:
					if (ref.nodeName == "LINK" && ref.rel == "stylesheet") {
						from.insertBefore(patch.item, ref);
						collect.push(ref);
					} else {
						from.replaceChild(patch.item, ref);
					}
					break;
				case Diff.DELETION:
					if (ref.nodeName == "LINK" && ref.rel == "stylesheet") {
						collect.push(ref);
					} else {
						ref.remove();
					}
					break;
			}
		}
		return collect;
	}

	mergeBody(node) {
		document.body.parentNode.replaceChild(node, document.body);
	}

	#updateAttributes(from, to) {
		const map = {};
		for (const att of to.attributes) map[att.name] = att.value;
		for (const att of Array.from(from.attributes)) { // mind the live collection
			const val = map[att.name];
			if (val === undefined) {
				from.removeAttribute(att.name);
			} else if (val != att.value) {
				from.setAttribute(att.name, val);
			}
			delete map[att.name];
		}
		for (const name in map) from.setAttribute(name, map[name]);
	}

	replace(loc, opts) {
		return this.#historyMethod('replace', loc, opts);
	}

	push(loc, opts) {
		return this.#historyMethod('push', loc, opts);
	}

	reload(opts) {
		if (!opts) opts = {};
		else if (opts === true) opts = { vary: true };
		let vary = opts.vary;
		if (vary == null) {
			if (this.#chains[BUILD]?.current?.count) {
				vary = BUILD;
			} else if (this.#chains[PATCH]?.current?.count) {
				vary = PATCH;
			} else if (this.#chains[FRAGMENT]?.current?.count) {
				vary = FRAGMENT;
			}
			opts.vary = vary;
		}
		return this.replace(this, opts);
	}

	save() {
		return this.#historySave('replace');
	}

	handleEvent(e) {
		if (e.type == "popstate") {
			const state = this.#stateFrom(e.state) || new State();
			this.#historyMethod('push', state, { pop: true, state: true });
		}
	}

	#stateTo() {
		return {
			href: this.toString(),
			data: this.data,
			stage: this.#stage
		};
	}

	#stateFrom(from) {
		if (!from || !from.href) return;
		const state = new State(from.href);
		state.data = from.data;
		state.#stage = from.stage;
		return state;
	}

	#historySave(method) {
		if (!window.history) return false;
		const to = this.#stateTo();
		window.history[method + 'State'](to, document.title, to.href);
		return true;
	}

	#historyMethod(method, loc, opts) {
		const refer = State.state;
		const copy = opts?.state ? loc : new State(loc);
		copy.#referrer = refer;
		if (!copy.sameDomain(refer)) {
			if (method == "replace") console.info("Cannot replace to a different origin");
			document.location.assign(copy.toString());
		}
		copy.run(opts).then(() => {
			if (!opts?.pop) copy.#historySave(method);
		});
		return copy;
	}
}

for (const stage of Stages) {
	Object.defineProperties(State.prototype, {
		[stage]: {
			value: function (fn) {
				return this.chain(stage, fn);
			}
		},
		[`un${stage}`]: {
			value: function (fn) {
				return this.unchain(stage, fn);
			}
		}
	});
}
