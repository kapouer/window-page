import { Deferred } from 'class-deferred';
import { debug, queryAll, get, createDoc } from './utils';
import Loc from './loc';
import { Queue, domDeferred, UiQueue, waitStyles, loadNode } from './wait';
import Diff from 'levenlistdiff';

const INIT = "init";
const ROUTE = "route";
const READY = "ready";
const BUILD = "build";
const PATCH = "patch";
const SETUP = "setup";
const PAINT = "paint";
const CLOSE = "close";
const CATCH = "catch";
const FOCUS = "focus";
const Stages = [INIT, ROUTE, READY, BUILD, PATCH, SETUP, PAINT, FOCUS, CATCH, CLOSE];
const NodeEvents = [BUILD, PATCH, SETUP, PAINT, FOCUS, CLOSE];

const runQueue = new Queue();
const uiQueue = new UiQueue();
const chainsMap = {};

export default class State extends Loc {
	static state = new State();
	data = {};
	#stage;
	#queue = new Deferred();
	#chains = {};
	#emitter;
	#referrer;

	format(loc) {
		return (new Loc(loc)).toString();
	}

	parse(str) {
		return new Loc(str);
	}

	get createDoc() {
		return createDoc;
	}

	get get() {
		return get;
	}

	#clone(state) {
		this.#emitter = state.#emitter;
		this.#referrer = state.#referrer;
		this.#chains = state.#chains;
		this.#queue = state.#queue;
	}

	get stage() {
		return this.#stage;
	}

	get referrer() {
		return this.#referrer;
	}

	#rebind() {
		window.Page = this;
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
				methods.push([all, name, key.slice(6).toLowerCase(), false]);
			} else if (name.startsWith('capture') && name != 'captureEvent') {
				methods.push([all, name, key.slice(7).toLowerCase(), true]);
			}
		}
		if (methods.length) this.chain(SETUP, state => {
			for (const name of methods) {
				name[4] = function (e) {
					listener[name[1]](e, State.state);
				};
				(name[0] ? window : node).addEventListener(name[2], name[4], name[3]);
			}
		});
		listener[CLOSE] = (function (close) {
			return function () {
				for (const name of methods) {
					(name[0] ? window : node).removeEventListener(name[2], name[4], name[3]);
				}
				if (close) return close.apply(listener, Array.from(arguments));
			};
		})(listener[CLOSE]);
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
		if (listener[CLOSE]) listener[CLOSE](this);
	}

	#prerender(ok, doc) {
		const root = (doc || document).documentElement;
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
		State.state = this;
		this.#stage = true;
		if (opts.data) Object.assign(this.data, opts.data);

		let prerendered, samePathname, sameQuery, sameHash;
		let { vary } = opts;
		if (vary === true) {
			vary = BUILD;
			prerendered = false;
		}
		if (vary == BUILD) {
			sameHash = sameQuery = samePathname = false;
		} else if (vary == PATCH) {
			samePathname = true;
			sameHash = sameQuery = false;
		} else if (vary == FOCUS) {
			samePathname = sameQuery = true;
			sameHash = false;
		}

		let refer = this.#referrer;
		if (!refer) {
			debug("new referrer");
			this.#referrer = refer = new State(this);
			refer.hash = "";
			samePathname = sameQuery = true;
			sameHash = this.sameHash(refer);
		} else if (refer == this) {
			throw new Error("state and referrer should be distinct");
		} else {
			if (samePathname == null) samePathname = this.samePathname(refer);
			if (sameQuery == null) sameQuery = this.sameQuery(refer);
			if (sameHash == null) sameHash = this.sameHash(refer);
			if (samePathname) {
				this.#clone(refer);
				Object.assign(this, refer);
				this.#referrer = refer;
			}
		}

		await domDeferred();
		if (prerendered == null) prerendered = this.#prerender();
		try {
			await this.runChain(INIT);
			if (!samePathname || !prerendered) {
				await this.runChain(ROUTE);
				if (this.doc && this.doc != document) {
					await this.#load(this.doc);
					delete this.doc;
				}
			}
			this.#prerender(true);
			debug("prerendered", prerendered);
			await this.runChain(READY);
			if (!prerendered || !samePathname) {
				await this.runChain(BUILD);
			}
			if (!prerendered || !sameQuery) {
				await this.runChain(PATCH);
			} else {
				// empty the chain but let it run
				this.initChain(PATCH).started = true;
			}
			// ui queue forks, so if multiple runs are made
			// only the first refer is closed, and the last state is setup
			uiQueue.run(async () => {
				try {
					window.removeEventListener('popstate', refer);
					window.addEventListener('popstate', this);
					await waitStyles();
					if (!refer.#stage || !samePathname) {
						await this.runChain(SETUP);
					}
					await this.runChain(PAINT);
					if (refer.#stage && !samePathname) {
						// close old state after new state setup to allow transitions
						await refer.runChain(CLOSE);
					}
					if (!sameHash) await this.runChain(FOCUS);
				} catch (err) {
					console.error(err);
				}
			});
		} catch(err) {
			this.error = err;
			await this.runChain(CATCH);
			const error = this.error;
			this.error = null;
			if (error) this.#queue.reject(error);
		}
		this.#queue.resolve(this);
		return this.#queue;
	}

	initChain(stage) {
		const chain = this.#chains[stage] ?? (this.#chains[stage] = {});
		chain.started = false;
		chain.hold = new Deferred();
		chain.after = new Queue();
		// block after
		chain.after.queue(() => chain.hold);
		chain.current = new Queue();
		// unblock after when current.done is resolved
		chain.current.done.then(chain.hold.resolve);

		const inst = new State(this);
		chain.done = chain.after.done.then(() => {
			Object.assign(this, chain.state);
			return this;
		});
		inst.#clone(this);
		Object.assign(inst, this); // also copy extra properties
		inst.#stage = stage;
		chain.state = inst;
		return chain;
	}

	runChain(stage) {
		const chain = this.initChain(stage);
		chain.started = true;
		debug("run chain", stage);

		const e = new CustomEvent(`page${stage}`, {
			view: window,
			bubbles: true,
			cancelable: true,
			detail: this
		});
		for (const node of queryAll(document, 'script')) {
			node.dispatchEvent(e);
		}
		if (this.#emitter) this.#emitter.dispatchEvent(e);

		debug("run chain length", stage, chain.current.length);
		if (chain.current.length == 0) chain.hold.resolve();
		return chain.done;
	}


	async chain(stage, fn) {
		const chain = this.#chains[stage] ?? this.initChain(stage);
		if (!fn) return chain.done;
		const stageMap = chainsMap[stage] ?? (chainsMap[stage] = new Map());
		const emitter = document.currentScript
			?? (fn.matches?.('script') ? fn : this.#emitter);
		let lfn = stageMap.get(fn);
		if (!lfn) {
			lfn = {
				fn: this.#chainListener(stage, fn),
				emitters: new Set()
			};
			stageMap.set(fn, lfn);
		}
		if (!lfn.emitters.has(emitter)) {
			lfn.emitters.add(emitter);
			emitter.addEventListener('page' + stage, lfn.fn);
		} else {
			debug("already chained", stage, fn);
		}
		if (!chain.started) {
			debug("chain pending", stage);
		} else if (chain.current.stopped) {
			await lfn.fn?.({ detail: chain.state });
		} else {
			debug("chain is running", stage);
			// not finished
			chain.current.queue(() => lfn.fn?.({ detail: chain.state }));
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
			emitter.removeEventListener('page' + stage, lfn.fn);
		}
		// chain might have queued lfn.fn call
		lfn.fn = null;
	}

	#chainListener(stage, fn) {
		return (e) => {
			const state = e.detail;
			const chain = state.#chains[stage];
			const q = chain.current;
			q.queue(() => {
				if (!q.stopped) return chain.state.#runFn(fn);
			});
			return q;
		};
	}

	async #runFn(fn) {
		const stage = this.#stage;
		const n = 'chain' + stage[0].toUpperCase() + stage.slice(1);
		const meth = fn?.[n] ?? fn?.[stage];
		// eslint-disable-next-line no-use-before-define
		try {
			if (meth && typeof meth == "function") {
				if (stage == CLOSE) this.unchain(stage, fn);
				return await meth.call(fn, this);
			} else if (typeof fn == "function") {
				return await fn(this);
			} else {
				console.warn("Missing function");
			}
		} catch (err) {
			console.error("Page." + stage, err);
		}
	}

	async #load(ndoc) {
		debug("Import new document");
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
		for (const node of queryAll(nhead, selOn)) {
			const type = node.nodeName == "SCRIPT" ? 'type' : 'rel';
			if (node[type]) node.setAttribute('priv-' + type, node[type]);
			node[type] = 'none';
		}
		// previous styles are not removed immediately to avoid fouc
		const oldstyles = this.mergeHead(nhead);

		// preload and start styles
		const parallels = [];
		const serials = [];
		for (const node of queryAll(document.head, selOff)) {
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
		debug("reload");
		if (!opts) opts = {};
		else if (opts === true) opts = { vary: true };
		let vary = opts.vary;
		if (vary == null) {
			if (this.#chains[BUILD]?.current?.count) {
				vary = BUILD;
			} else if (this.#chains[PATCH]?.current?.count) {
				vary = PATCH;
			} else if (this.#chains[FOCUS]?.current?.count) {
				vary = FOCUS;
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
			debug("history event from", this.pathname, this.query, "to", e.state && e.state.href || null);
			const state = this.#stateFrom(e.state) || new State();
			this.#historyMethod('push', state, { pop: true });
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
		debug("history", method, to);
		window.history[method + 'State'](to, document.title, to.href);
		return true;
	}

	async #historyMethod(method, loc, opts) {
		const refer = State.state;
		const copy = new State(loc);
		copy.#referrer = refer;
		if (!copy.sameDomain(refer)) {
			if (method == "replace") console.info("Cannot replace to a different origin");
			document.location.assign(copy.toString());
		}
		debug("run", method, copy, opts);
		await copy.run(opts);
		if (!opts?.pop) copy.#historySave(method);
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
