const Utils = require('./utils');
const Loc = require('./loc');
const Wait = require('./wait');
const Diff = require('levenlistdiff');
const P = Utils.P;
const debug = Utils.debug;

module.exports = State;

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

let queue;
let uiQueue;

function State() {
	this.data = {};
	this.ui = {};
	this.chains = {};
	this.query = {};
	let ok, fail;
	this.queue = new Promise(function(resolve, reject) {
		ok = resolve;
		fail = reject;
	});
	this.queue.ok = ok;
	this.queue.fail = fail;
}

State.prototype.init = function(opts) {
	const W = State.Page;
	const state = this;
	if (opts.data) Object.assign(this.data, opts.data);

	this.emitter = document.createElement('div');

	Stages.forEach(function(stage) {
		W[stage] = function(fn) {
			return state.chain(stage, fn);
		};
		W['un' + stage] = function(fn) {
			return state.unchain(stage, fn);
		};
		W.finish = function(fn) {
			if (fn) return state.queue.then(fn);
			else return state.queue;
		};
	});

	W.connect = function(listener, node) {
		state.connect(listener, node);
	};

	W.disconnect = function (listener) {
		state.disconnect(listener);
	};
};

State.prototype.connect = function(listener, node) {
	const methods = [];
	if (!node) node = listener;
	let proto = listener.constructor;
	proto = proto === Object ? listener : proto.prototype;
	Object.getOwnPropertyNames(proto).filter(function(name) {
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
	});
	if (methods.length) this.chain(SETUP, function(state) {
		methods.forEach(function(name) {
			name[4] = function(e) {
				let last = state;
				while (last.follower) last = last.follower;
				listener[name[1]].call(listener, e, last);
			};
			(name[0] ? window : node).addEventListener(name[2], name[4], name[3]);
		});
	});
	listener[CLOSE] = (function (close) {
		return function () {
			methods.forEach(function (name) {
				(name[0] ? window : node).removeEventListener(name[2], name[4], name[3]);
			});
			if (close) return close.apply(listener, Array.from(arguments));
		};
	})(listener[CLOSE]);
	NodeEvents.forEach(function(k) {
		if (listener[k]) this.chain(k, listener);
	}, this);
};

State.prototype.disconnect = function (listener) {
	NodeEvents.forEach(function(k) {
		if (listener[k]) {
			this.unchain(k, listener);
		}
	}, this);
	if (listener.close) listener.close(this);
};

State.prototype.run = function(opts) {
	const state = this;
	if (queue) {
		queue = queue.then(function() {
			return state.run(opts);
		});
	} else {
		queue = run(state, opts).then(function(state) {
			queue = null;
			return state;
		});
	}
	return queue;
};

function prerender(ok, doc) {
	const root = (doc || document).documentElement;
	if (ok === undefined) ok = root.dataset.prerender == 'true';
	else if (ok === true) root.setAttribute('data-prerender', 'true');
	else if (ok === false) root.removeAttribute('data-prerender');
	return ok;
}

function run(state, opts) {
	if (!opts) opts = {};
	state.init(opts);
	let refer = state.referrer;

	if (!refer) {
		debug("new referrer");
		state.referrer = refer = state.copy();
		delete refer.hash;
	}
	if (refer == state) {
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
	if (samePathname == null) samePathname = Loc.samePathname(refer, state);
	if (sameQuery == null) sameQuery = Loc.sameQuery(refer, state);
	if (sameHash == null) sameHash = state.hash == refer.hash;

	if (samePathname) {
		['chains', 'emitter', 'ui', 'data'].forEach(function(key) {
			if (refer[key] != null) state[key] = refer[key];
		});
	}

	Wait.dom().then(function () {
		if (prerendered == null) prerendered = prerender();
		return state.runChain(INIT);
	}).then(function() {
		if (!samePathname || !prerendered) {
			return state.router();
		}
	}).then(function(doc) {
		if (doc && doc != document) return load(state, doc);
	}).then(function(doc) {
		if (doc) prerendered = prerender();
		prerender(true);
		debug("prerendered", prerendered);
		return state.runChain(READY);
	}).then(function() {
		if (!prerendered || !samePathname) return state.runChain(BUILD);
	}).then(function() {
		if (!prerendered || !sameQuery) return state.runChain(PATCH);
		else state.initChain(PATCH);
	}).then(function() {
		// if multiple runs are made without ui,
		// only the first refer is closed, and the last state is setup
		if (!uiQueue) uiQueue = Wait.ui(refer);
		uiQueue.fn = function(refer) {
			uiQueue = null;
			return Promise.resolve().then(function() {
				window.removeEventListener('popstate', refer);
				window.addEventListener('popstate', state);
				if (!refer.stage || !samePathname) {
					return state.runChain(SETUP);
				}
			}).then(function() {
				return state.runChain(PAINT);
			}).then(function() {
				if (refer.stage && !samePathname) {
					return refer.runChain(CLOSE);
				}
			}).then(function() {
				if (!sameHash) return state.runChain(HASH);
			});
		};
	}).catch(function(err) {
		state.error = err;
		return (state.runChain(ERROR) || P()).then(function() {
			if (state.error) state.queue.fail(state.error);
		});
	}).then(function() {
		state.queue.ok(state);
	});
	return state.queue;
}

State.prototype.emit = function(name) {
	const e = new CustomEvent(name, {
		view: window,
		bubbles: true,
		cancelable: true,
		detail: this
	});
	Utils.all(document, 'script').forEach(function(node) {
		node.dispatchEvent(e);
	});
	if (this.emitter) this.emitter.dispatchEvent(e);
};

State.prototype.initChain = function(name) {
	let chain = this.chains[name];
	if (!chain) chain = this.chains[name] = {};
	chain.count = 0;
	chain.promise = P();
	return chain;
};

State.prototype.runChain = function(name) {
	this.stage = name;
	const chain = this.initChain(name);
	debug("run chain", name);
	chain.final = new Promise(function(resolve, reject) {
		chain.done = resolve;
		chain.fail = function(err) {
			delete chain.done;
			reject(err);
		};
	});
	this.emit("page" + name);
	debug("run chain count", name, chain.count);
	if (!chain.count) return;
	return chain.promise.then(function () {
		const done = chain.done;
		delete chain.done;
		if (done) return done();
	})
		.catch(chain.fail)
		.then(function() {
			return chain.final;
		});
};


State.prototype.chain = function(stage, fn) {
	if (!fn) throw new Error("Missing function or listener");
	const state = this;
	let ls = fn._pageListeners;
	if (!ls) ls = fn._pageListeners = {};
	let lfn = ls[stage];
	const emitter = typeof fn == "function" && document.currentScript || state.emitter;

	if (!lfn) {
		lfn = ls[stage] = {
			fn: chainListener(stage, fn),
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
	} else if (chain.count && chain.done) {
		debug("chain is running", stage);
		// not finished
		chain.done = function(done) {
			return P().then(function() {
				if (lfn.fn) return lfn.fn({detail: state});
			}).then(done);
		}.bind(null, chain.done);
	} else {
		debug("chain is done", stage);
		p = p.then(function() {
			if (lfn.fn) return lfn.fn({detail: state});
		});
	}
	return p;
};

State.prototype.finish = function(fn) {
	const state = this;
	const stage = this.stage;
	const chain = this.chains[stage];
	if (!chain) {
		// eslint-disable-next-line no-console
		console.warn("state.finish must be called from chain listener");
	} else {
		chain.final = chain.final.then(function() {
			return runFn(stage, fn, state);
		});
	}
	return this;
};

State.prototype.stop = function() {
	const stage = this.stage;
	const chain = this.chains[stage];
	if (!chain) {
		// eslint-disable-next-line no-console
		console.warn("state.stop must be called from chain listener");
	} else {
		chain.stop = true;
	}
	return this;
};

State.prototype.unchain = function(stage, fn) {
	const ls = fn._pageListeners;
	if (!ls) return;
	const lfn = ls[stage];
	if (!lfn) return;
	delete ls[stage];
	lfn.em.removeEventListener('page' + stage, lfn.fn);
	delete lfn.fn; // so that already reached chains can be unchained before execution
};

function chainListener(stage, fn) {
	return function(e) {
		const state = e.detail;
		const chain = state.chains[stage];
		const stop = chain.stop;
		if (chain.count == null) chain.count = 0;
		chain.count++;
		chain.promise = chain.promise.then(function() {
			return !stop && runFn(stage, fn, state);
		}).catch(function(err) {
			// eslint-disable-next-line no-console
			console.error("Page." + stage, err);
		});
		return chain.promise;
	};
}

function runFn(stage, fn, state) {
	const n = 'chain' + stage[0].toUpperCase() + stage.slice(1);
	const meth = fn[n] || fn[stage];
	if (meth && typeof meth == "function") {
		if (stage == CLOSE) state.unchain(stage, fn);
		return meth.call(fn, state);
	} else if (typeof fn == "function") {
		return fn(state);
	} else {
		// eslint-disable-next-line no-console
		console.warn("Missing function");
	}
}

function load(state, doc) {
	debug("Import new document");
	if (!doc.documentElement || !doc.querySelector) {
		throw new Error("Router should return a document with a documentElement");
	}
	const states = {};
	const selector = 'script:not([type]),script[type="text/javascript"],link[rel="import"]';
	Utils.all(document, selector).forEach(function(node) {
		const src = node.src || node.href;
		if (src) states[src] = true;
	});

	// if there is no HTMLImports support, some loaded script might contain
	// the HTMLImports polyfill itself, which will load imports however it likes
	// so it's hard to decide which order is good, and it's also impossible to know
	// if that polyfill will be available - so load(state) does not preload
	// imports nor does it let them run on insert
	// if there is native support then it's like other resources.

	const nodes = Utils.all(doc, selector);

	nodes.forEach(function(node) {
		// just preload everything
		if (node.nodeName == "SCRIPT") {
			node.setAttribute('type', "none");
		} else if (node.nodeName == "LINK") {
			node.setAttribute('rel', 'none');
			if (!node.import) return; // polyfill already do preloading
		}
		const src = node.src || node.href;
		if (!src) return;
		if (states[src] === true) return;
		const loc = Loc.parse(src);
		if (loc.protocol == "data:") return;
		if (Loc.sameDomain(loc, state)) states[src] = Utils.get(src, 400).then(function() {
			debug("preloaded", src);
		}).catch(function(err) {
			debug("not preloaded", src, err);
		});
	});

	function loadNode(node) {
		let p = P();
		const src = node.src || node.href;
		const state = states[src];
		const old = state === true;
		const loader = !old && state;
		if (loader) {
			p = p.then(loader);
		}
		return p.then(function() {
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
				rp = new Promise(function(resolve) {
					setTimeout(resolve);
				});
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

	state.updateAttributes(root, nroot);

	const parallels = Wait.styles(head, document.head);
	const serials = Utils.all(nroot, 'script[type="none"],link[rel="none"]');
	let oldstyles = [];

	return P().then(function() {
		oldstyles = state.mergeHead(head, document.head);
		return parallels;
	}).then(function() {
		return P().then(function() {
			return state.mergeBody(body, document.body);
		});
	}).then(function() {
		oldstyles.forEach(function(node) {
			node.remove();
		});
		// scripts must be run in order
		let p = P();
		serials.forEach(function(node) {
			p = p.then(function() {
				return loadNode(node);
			});
		});
		return p;
	}).then(function() {
		return doc;
	});
}

State.prototype.mergeHead = function(node) {
	this.updateAttributes(document.head, node);
	const from = document.head;
	const to = node;
	const collect = [];
	Diff(from.children, to.children, function(child) {
		const key = child.src || child.href;
		if (key) return child.nodeName + '_' + key;
		else return child.outerHTML;
	}).forEach(function(patch) {
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
	});
	return collect;
};

State.prototype.mergeBody = function(node) {
	document.body.parentNode.replaceChild(node, document.body);
};

State.prototype.updateAttributes = function(from, to) {
	const map = {};
	Array.from(to.attributes).forEach(function(att) {
		map[att.name] = att.value;
	});
	Array.from(from.attributes).forEach(function(att) {
		const val = map[att.name];
		if (val === undefined) {
			from.removeAttribute(att.name);
		} else if (val != att.value) {
			from.setAttribute(att.name, val);
		}
		delete map[att.name];
	});
	for (const name in map) from.setAttribute(name, map[name]);
};

State.prototype.replace = function(loc, opts) {
	return historyMethod('replace', loc, this, opts);
};

State.prototype.push = function(loc, opts) {
	return historyMethod('push', loc, this, opts);
};

State.prototype.reload = function(opts) {
	debug("reload");
	if (!opts) opts = {};
	else if (opts === true) opts = {vary: true};
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
};

State.prototype.save = function() {
	return historySave('replace', this);
};

State.prototype.copy = function() {
	return Loc.parse(this);
};

State.prototype.router = function() {
	const refer = this.referrer;
	if (!refer.stage) {
		debug("Default router starts after navigation");
		return;
	}
	const url = Loc.format(this);
	return Utils.get(url, 500, 'text/html').then(function(client) {
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
};

State.prototype.handleEvent = function(e) {
	if (e.type == "popstate") {
		debug("history event from", this.pathname, this.query, "to", e.state && e.state.href || null);
		const state = stateFrom(e.state) || Loc.parse();
		state.referrer = this;
		state.run().catch(function(err) {
			// eslint-disable-next-line no-console
			console.error(err);
			const url = Loc.format(state);
			setTimeout(function() {
				document.location.replace(url);
			}, 50);
		});
	}
};

State.prototype.toString = function() {
	return Loc.format(this);
};

function stateTo(state) {
	return {
		href: Loc.format(state),
		data: state.data,
		stage: state.stage
	};
}

function stateFrom(from) {
	if (!from || !from.href) return;
	const state = Loc.parse(from.href);
	delete from.href;
	Object.assign(state, from);
	return state;
}

function historySave(method, state) {
	if (!window.history) return false;
	const to = stateTo(state);
	debug("history", method, to);
	window.history[method + 'State'](to, document.title, to.href);
	return true;
}

function historyMethod(method, loc, refer, opts) {
	if (!refer) throw new Error("Missing referrer parameter");
	const copy = Loc.parse(Loc.format(loc));
	copy.referrer = refer;
	refer.follower = copy;
	if (!Loc.sameDomain(refer, copy)) {
		// eslint-disable-next-line no-console
		if (method == "replace") console.info("Cannot replace to a different origin");
		document.location.assign(Loc.format(copy));
		return P();
	}
	debug("run", method, copy, opts);
	return copy.run(opts).then(function(state) {
		historySave(method, state);
	}).catch(function(err) {
		// eslint-disable-next-line no-console
		console.error(err);
		const url = Loc.format(copy);
		setTimeout(function() {
			if (method == "replace") document.location.replace(url);
			else document.location.assign(url);
		}, 50);
	});
}

