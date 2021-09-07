import * as Utils from './utils';
import Loc from './loc';
import * as Wait from './wait';
import Diff from 'levenlistdiff';
const P = Utils.P;
const debug = Utils.debug;

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

const runQueue = new Utils.Queue();
let uiQueue;

export default class State extends Loc {
	data = {};
	ui = {};
	chains = {};
	#queue
	#bound
	static #route

	constructor(obj) {
		super(obj);
		this.#queue = new Utils.Deferred();
	}

	rebind(W) {
		if (this.#bound) return W;
		this.#bound = true;
		for (const stage of Stages) {
			W[stage] = (fn) => this.chain(stage, fn);
			W['un' + stage] = (fn) => this.unchain(stage, fn);
			W.finish = (fn) => {
				if (fn) return this.#queue.then(fn);
				else return this.#queue.promise;
			};
		}
		W.route = (fn) => State.#route = fn;
		W.connect = (listener, node) => this.connect(listener, node);
		W.disconnect = (listener) => this.disconnect(listener);
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
		if (methods.length) this.chain(SETUP, function (state) {
			for (const name of methods) {
				name[4] = function (e) {
					let last = state;
					while (last.follower) last = last.follower;
					listener[name[1]].call(listener, e, last);
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
		return runQueue.queue(() => this.#run(opts));
	}

	#run(opts) {
		if (!opts) opts = {};
		this.rebind(window.Page);
		if (opts.data) Object.assign(this.data, opts.data);
		this.emitter = document.createElement('div');

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

		Wait.dom().then(() => {
			if (prerendered == null) prerendered = this.#prerender();
			return this.runChain(INIT);
		}).then(() => {
			if (!samePathname || !prerendered) {
				const fn = State.#route;
				if (fn) return fn(this);
				else return this.#defaultRoute();
			}
		}).then((doc) => {
			if (doc && doc != document) return this.#load(doc);
		}).then((doc) => {
			if (doc) prerendered = this.#prerender();
			this.#prerender(true);
			debug("prerendered", prerendered);
			return this.runChain(READY);
		}).then(() => {
			if (!prerendered || !samePathname) return this.runChain(BUILD);
		}).then(() => {
			if (!prerendered || !sameQuery) return this.runChain(PATCH);
			else this.initChain(PATCH);
		}).then(() => {
			// if multiple runs are made without ui,
			// only the first refer is closed, and the last state is setup
			if (!uiQueue) uiQueue = Wait.ui(refer);
			uiQueue.fn = (refer) => {
				uiQueue = null;
				return Promise.resolve().then(() => {
					window.removeEventListener('popstate', refer);
					window.addEventListener('popstate', this);
					if (!refer.stage || !samePathname) {
						return this.runChain(SETUP);
					}
				}).then(() => {
					return this.runChain(PAINT);
				}).then(() => {
					if (refer.stage && !samePathname) {
						return refer.runChain(CLOSE);
					}
				}).then(() => {
					if (!sameHash) return this.runChain(HASH);
				});
			};
		}).catch((err) => {
			this.error = err;
			return (this.runChain(ERROR) || P()).then(() => {
				if (this.error) this.#queue.fail(this.error);
			});
		}).then(() => {
			this.#queue.ok(this);
		});
		return this.#queue.promise;
	}

	emit(name) {
		const e = new CustomEvent(name, {
			view: window,
			bubbles: true,
			cancelable: true,
			detail: this
		});
		for (const node of Utils.all(document, 'script'))	node.dispatchEvent(e);
		if (this.emitter) this.emitter.dispatchEvent(e);
	}

	initChain(name) {
		let chain = this.chains[name];
		if (!chain) chain = this.chains[name] = {};
		chain.count = 0;
		chain.promise = P();
		return chain;
	}

	runChain(name) {
		this.stage = name;
		const chain = this.initChain(name);
		debug("run chain", name);
		chain.final = new Utils.Deferred();
		this.emit("page" + name);
		debug("run chain count", name, chain.count);
		if (!chain.count) return;
		return chain.promise
			.then(function () {
				const ok = chain.final.ok;
				if (ok) ok();
				delete chain.final.ok;
			})
			.catch(chain.final.fail)
			.then(function () {
				return chain.final.promise;
			});
	}


	chain(stage, fn) {
		if (!fn) throw new Error("Missing function or listener");
		const state = this;
		let ls = fn._pageListeners;
		if (!ls) ls = fn._pageListeners = {};
		let lfn = ls[stage];
		const emitter = typeof fn == "function" && document.currentScript || state.emitter;

		if (!lfn) {
			lfn = ls[stage] = {
				fn: this.#chainListener(stage, fn),
				em: emitter
			};
			emitter.addEventListener('page' + stage, lfn.fn);
		} else {
			debug("already chained", stage, fn);
		}
		let p = P();
		const chain = this.chains[stage];
		if (!chain) {
			debug("chain pending", stage);
		} else if (chain.count && chain.final && chain.final.ok) {
			debug("chain is running", stage);
			// not finished
			chain.final.ok = function (done) {
				return P().then(function () {
					if (lfn.fn) return lfn.fn({ detail: state });
				}).then(done);
			}.bind(null, chain.final.ok);
		} else {
			debug("chain is done", stage);
			p = p.then(function () {
				if (lfn.fn) return lfn.fn({ detail: state });
			});
		}
		return p;
	}

	finish(fn) {
		const stage = this.stage;
		const chain = this.chains[stage];
		if (!chain) {
			// eslint-disable-next-line no-console
			console.warn("state.finish must be called from chain listener");
		} else {
			chain.final.promise = chain.final.promise.then(() => {
				return this.#runFn(stage, fn);
			});
		}
		return this;
	}

	stop() {
		const stage = this.stage;
		const chain = this.chains[stage];
		if (!chain) {
			// eslint-disable-next-line no-console
			console.warn("state.stop must be called from chain listener");
		} else {
			chain.stop = true;
		}
		return this;
	}

	unchain(stage, fn) {
		const ls = fn._pageListeners;
		if (!ls) return;
		const lfn = ls[stage];
		if (!lfn) return;
		delete ls[stage];
		lfn.em.removeEventListener('page' + stage, lfn.fn);
		delete lfn.fn; // so that already reached chains can be unchained before execution
	}

	#chainListener(stage, fn) {
		return (e) => {
			const state = e.detail;
			const chain = state.chains[stage];
			const stop = chain.stop;
			if (chain.count == null) chain.count = 0;
			chain.count++;
			chain.promise = chain.promise.then(() => {
				return !stop && state.#runFn(stage, fn);
			}).catch((err) => {
				// eslint-disable-next-line no-console
				console.error("Page." + stage, err);
			});
			return chain.promise;
		};
	}

	#runFn(stage, fn) {
		const n = 'chain' + stage[0].toUpperCase() + stage.slice(1);
		const meth = fn[n] || fn[stage];
		if (meth && typeof meth == "function") {
			if (stage == CLOSE) this.unchain(stage, fn);
			return meth.call(fn, this);
		} else if (typeof fn == "function") {
			return fn(this);
		} else {
			// eslint-disable-next-line no-console
			console.warn("Missing function");
		}
	}

	#load(doc) {
		debug("Import new document");
		if (!doc.documentElement || !doc.querySelector) {
			throw new Error("Router should return a document with a documentElement");
		}
		const states = {};
		const selector = 'script:not([type]),script[type="text/javascript"],link[rel="import"]';
		for (const node of Utils.all(document, selector)) {
			const src = node.src || node.href;
			if (src) states[src] = true;
		}

		// if there is no HTMLImports support, some loaded script might contain
		// the HTMLImports polyfill itself, which will load imports however it likes
		// so it's hard to decide which order is good, and it's also impossible to know
		// if that polyfill will be available - so load(state) does not preload
		// imports nor does it let them run on insert
		// if there is native support then it's like other resources.

		for (const node of Utils.all(doc, selector)) {
			// just preload everything
			if (node.nodeName == "SCRIPT") {
				node.setAttribute('type', "none");
			} else if (node.nodeName == "LINK") {
				node.setAttribute('rel', 'none');
				if (!node.import) continue; // polyfill already do preloading
			}
			const src = node.src || node.href;
			if (!src || states[src] === true) continue;
			const loc = new Loc(src);
			if (loc.protocol == "data:") continue;
			if (loc.sameDomain(this)) states[src] = Utils.get(src, 400).then(() => {
				debug("preloaded", src);
			}).catch((err) => {
				debug("not preloaded", src, err);
			});
		}

		function loadNode(node) {
			let p = P();
			const src = node.src || node.href;
			const state = states[src];
			const old = state === true;
			const loader = !old && state;
			if (loader) {
				p = p.then(loader);
			}
			return p.then(function () {
				const parent = node.parentNode;
				let cursor;
				if (!old) {
					cursor = document.createTextNode("");
					parent.insertBefore(cursor, node);
					parent.removeChild(node);
				}
				if (node.nodeName == "LINK") {
					node.setAttribute('rel', 'import');
				} else if (node.nodeName == "SCRIPT") {
					node.removeAttribute('type');
				}
				if (old) return;
				const copy = document.createElement(node.nodeName);
				for (let i = 0; i < node.attributes.length; i++) {
					copy.setAttribute(node.attributes[i].name, node.attributes[i].value);
				}
				if (node.textContent) copy.textContent = node.textContent;
				let rp;
				if (src) {
					debug("async node loading", src);
					if (node.nodeName == "LINK" && !node.import) {
						debug("not loading import", src);
					} else {
						rp = Wait.node(copy);
					}
				} else {
					debug("inline node loading");
					rp = new Promise((resolve) => setTimeout(resolve));
				}
				parent.insertBefore(copy, cursor);
				parent.removeChild(cursor);
				if (rp) return rp;
			});
		}

		const root = document.documentElement;
		const nroot = document.adoptNode(doc.documentElement);
		const head = nroot.querySelector('head');
		const body = nroot.querySelector('body');

		this.#updateAttributes(root, nroot);

		const parallels = Wait.styles(head, document.head);
		const serials = Utils.all(nroot, 'script[type="none"],link[rel="none"]');
		let oldstyles = [];

		return P().then(() => {
			oldstyles = this.mergeHead(head, document.head);
			return parallels;
		}).then(() => {
			return this.mergeBody(body, document.body);
		}).then(() => {
			for (const node of oldstyles) node.remove();
			// scripts must be run in order
			let p = P();
			for (const node of serials) {
				p = p.then(() => loadNode(node));
			}
			return p;
		}).then(function () {
			return doc;
		});
	}

	mergeHead(node) {
		this.#updateAttributes(document.head, node);
		const from = document.head;
		const to = node;
		const collect = [];
		const list = Diff(from.children, to.children, function (child) {
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
			if (this.chains.build && this.chains.build.count) {
				vary = BUILD;
			} else if (this.chains.patch && this.chains.patch.count) {
				vary = PATCH;
			} else if (this.chains.hash && this.chains.hash.count) {
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

	#defaultRoute() {
		const refer = this.referrer;
		if (!refer.stage) {
			debug("Default router starts after navigation");
			return;
		}
		const url = this.toString();
		return Utils.get(url, 500, 'text/html').then(function (client) {
			let doc;
			if (client.status >= 200) {
				doc = Utils.createDoc(client.responseText);
				if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
					throw new Error(client.statusText);
				}
			}
			if (!doc) throw new Error("Cannot load remote document");
			return doc;
		});
	}

	handleEvent(e) {
		if (e.type == "popstate") {
			debug("history event from", this.pathname, this.query, "to", e.state && e.state.href || null);
			const state = this.#stateFrom(e.state) || new State();
			state.referrer = this;
			state.run().catch(function (err) {
				// eslint-disable-next-line no-console
				console.error(err);
				const url = state.toString();
				setTimeout(function () {
					document.location.replace(url);
				}, 50);
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

	#historyMethod(method, loc, opts) {
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
			// eslint-disable-next-line no-console
			if (method == "replace") console.info("Cannot replace to a different origin");
			document.location.assign(copy.toString());
			return P();
		}
		debug("run", method, copy, opts);
		return copy.run(opts).then((state) => {
			state.#historySave(method);
		}).catch(function (err) {
			// eslint-disable-next-line no-console
			console.error(err);
			const url = copy.toString();
			setTimeout(() => {
				if (method == "replace") document.location.replace(url);
				else document.location.assign(url);
			}, 50);
		});
	}
}
