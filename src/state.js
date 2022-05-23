import { Deferred, debug, queryAll, get, createDoc } from './utils';
import Loc from './loc';
import { Queue, DOMQueue, UiQueue, waitStyles, loadNode } from './wait';
import Diff from 'levenlistdiff';

const INIT = "init";
const READY = "ready";
const BUILD = "build";
const PATCH = "patch";
const SETUP = "setup";
const PAINT = "paint";
const CLOSE = "close";
const ERROR = "error";
const HASH = "hash";
const Stages = [INIT, READY, BUILD, PATCH, SETUP, PAINT, HASH, ERROR, CLOSE];
const NodeEvents = [BUILD, PATCH, SETUP, PAINT, HASH, CLOSE];

const runQueue = new Queue();
const uiQueue = new UiQueue();
const chainsMap = {};

export default class State extends Loc {
	data = {};
	ui = {};
	chains = {};
	#queue;
	#bound;
	static #route;

	constructor(obj) {
		super(obj);
		this.#queue = new Deferred();
	}

	rebind(W) {
		if (this.#bound) return W;
		this.#bound = true;
		for (const stage of Stages) {
			W[stage] = fn => this.chain(stage, fn);
			W['un' + stage] = fn => this.unchain(stage, fn);
			W.finish = fn => {
				if (fn) return this.#queue.then(fn);
				else return this.#queue;
			};
		}
		W.route = fn => State.#route = fn;
		W.connect = (listener, node) => this.connect(listener, node);
		W.disconnect = listener => this.disconnect(listener);
		return W;
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
					let last = state;
					while (last.follower) last = last.follower;
					listener[name[1]](e, last);
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
		if (listener.close) listener.close(this);
	}

	#prerender(ok, doc) {
		const root = (doc || document).documentElement;
		if (ok === undefined) ok = root.dataset.prerender == 'true';
		else if (ok === true) root.setAttribute('data-prerender', 'true');
		else if (ok === false) root.removeAttribute('data-prerender');
		return ok;
	}

	run(opts) {
		this.emitter = document.createElement('div');
		return runQueue.queue(() => this.#run(opts));
	}

	async #run(opts) {
		if (!opts) opts = {};
		this.rebind(window.Page);
		if (opts.data) Object.assign(this.data, opts.data);

		let refer = this.referrer;
		if (!refer) {
			debug("new referrer");
			this.referrer = refer = this.copy();
			delete refer.hash;
		}
		if (refer == this) {
			throw new Error("state and referrer should be distinct");
		}

		let prerendered, samePathname, sameQuery, sameHash;
		let vary = opts.vary;
		if (vary === true) {
			vary = BUILD;
			prerendered = false;
		}
		if (vary == BUILD) {
			sameHash = sameQuery = samePathname = false;
		} else if (vary == PATCH) {
			sameHash = sameQuery = false;
		} else if (vary == HASH) {
			sameHash = false;
		}
		if (samePathname == null) samePathname = this.samePathname(refer);
		if (sameQuery == null) sameQuery = this.sameQuery(refer);
		if (sameHash == null) sameHash = this.sameHash(refer);

		if (samePathname) {
			for (const key of ['chains', 'emitter', 'ui', 'data']) {
				if (refer[key] != null) this[key] = refer[key];
			}
		}

		await DOMQueue();
		if (prerendered == null) prerendered = this.#prerender();
		try {
			await this.runChain(INIT);
			if (!samePathname || !prerendered) {
				const doc = await (State.#route ? State.#route(this) : this.#defaultRoute());
				if (doc) {
					if (doc != document) await this.#load(doc);
					prerendered = this.#prerender();
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
				await this.initChain(PATCH);
			}
			// ui queue forks, so if multiple runs are made
			// only the first refer is closed, and the last state is setup
			uiQueue.run(async () => {
				try {
					window.removeEventListener('popstate', refer);
					window.addEventListener('popstate', this);
					await waitStyles();
					if (!refer.stage || !samePathname) {
						await this.runChain(SETUP);
					}
					await this.runChain(PAINT);
					if (refer.stage && !samePathname) {
						// close old state after new state setup to allow transitions
						await refer.runChain(CLOSE);
					}
					if (!sameHash) await this.runChain(HASH);
				} catch (err) {
					console.error(err);
				}
			});
		} catch(err) {
			this.error = err;
			await this.runChain(ERROR);
			if (this.error) this.#queue.reject(this.error);
		}
		this.#queue.resolve(this);
		return this.#queue;
	}

	emit(name) {
		const e = new CustomEvent(name, {
			view: window,
			bubbles: true,
			cancelable: true,
			detail: this
		});
		for (const node of queryAll(document, 'script')) {
			node.dispatchEvent(e);
		}
		if (this.emitter) this.emitter.dispatchEvent(e);
	}

	initChain(name) {
		const chain = this.chains[name] ?? (this.chains[name] = { name });
		chain.hold = new Deferred();
		chain.after = new Queue();
		// block after
		chain.after.queue(() => chain.hold);
		chain.current = new Queue();
		// unblock after when current.done is resolved
		chain.current.done.then(chain.hold.resolve);
		return chain;
	}

	runChain(name) {
		this.stage = name;
		const chain = this.initChain(name);
		debug("run chain", name);
		this.emit("page" + name);
		debug("run chain length", name, chain.current.length);
		if (chain.current.length == 0) chain.hold.resolve();
		return chain.after.done;
	}


	chain(stage, fn) {
		if (!fn) throw new Error("Missing function or listener");
		const state = this;
		const stageMap = chainsMap[stage] ?? (chainsMap[stage] = new Map());
		const emitter = document.currentScript
			|| fn.matches?.('script') && fn
			|| state.emitter;
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
		const chain = this.chains[stage];
		if (!chain?.current) {
			debug("chain pending", stage);
		} else if (chain.current.stopped) {
			return lfn.fn?.({ detail: state });
		} else {
			debug("chain is running", stage);
			// not finished
			chain.current.queue(() => lfn.fn?.({ detail: state }));
		}
	}

	finish(fn) {
		const stage = this.stage;
		const chain = this.chains[stage];
		if (!chain) {
			console.warn("state.finish must be called from chain listener");
		} else {
			chain.after.queue(() => this.#runFn(stage, fn));
		}
		return this;
	}

	stop() {
		const stage = this.stage;
		const chain = this.chains[stage];
		if (!chain) {
			console.warn("state.stop must be called from chain listener");
		} else {
			chain.stop = true;
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
			const q = state.chains[stage]?.current;
			q.queue(() => {
				if (q.stopped) return;
				return state.#runFn(stage, fn);
			});
			return q;
		};
	}

	async #runFn(stage, fn) {
		const n = 'chain' + stage[0].toUpperCase() + stage.slice(1);
		const meth = fn?.[n] ?? fn?.[stage];
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
		const oldstyles = this.mergeHead(nhead, document.head);

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
			const key = child.src || child.href;
			if (key) return child.nodeName + '_' + key;
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
			if (this.chains.build?.current?.count) {
				vary = BUILD;
			} else if (this.chains.patch?.current?.count) {
				vary = PATCH;
			} else if (this.chains.hash?.current?.count) {
				vary = HASH;
			}
			opts.vary = vary;
		}
		return this.replace(this, opts);
	}

	save() {
		return this.#historySave('replace');
	}

	copy() {
		return new State(new Loc(this));
	}

	async #defaultRoute() {
		const refer = this.referrer;
		if (!refer.stage) {
			debug("Default router starts after navigation");
			return;
		}
		const url = this.toString();
		const client = await get(url, 500, 'text/html');
		let doc;
		if (client.status >= 200) {
			doc = createDoc(client.responseText);
			if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
				throw new Error(client.statusText);
			}
		}
		if (!doc) throw new Error("Cannot load remote document");
		return doc;
	}

	handleEvent(e) {
		if (e.type == "popstate") {
			debug("history event from", this.pathname, this.query, "to", e.state && e.state.href || null);
			const state = this.#stateFrom(e.state) || new State();
			state.referrer = this;
			state.run().catch(err => {
				console.error(err);
				const url = state.toString();
				setTimeout(() => document.location.replace(url), 50);
			});
		}
	}

	#stateTo() {
		return {
			href: this.toString(),
			data: this.data,
			stage: this.stage
		};
	}

	#stateFrom(from) {
		if (!from || !from.href) return;
		const state = new State(from.href);
		delete from.href;
		Object.assign(state, from);
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
		let refer = this;
		while (refer.follower) {
			// a common mistake is to call state.push on an old state
			// and there is no way this can be legit
			refer = refer.follower;
		}
		const copy = new State(loc);
		copy.referrer = refer;
		refer.follower = copy;
		if (!copy.sameDomain(refer)) {
			if (method == "replace") console.info("Cannot replace to a different origin");
			document.location.assign(copy.toString());
		}
		debug("run", method, copy, opts);
		try {
			const state = await copy.run(opts);
			state.#historySave(method);
			return state;
		} catch(err) {
			console.error(err);
			const url = copy.toString();
			setTimeout(() => {
				if (method == "replace") document.location.replace(url);
				else document.location.assign(url);
			}, 50);
		}
	}
}
