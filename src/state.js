var Utils = require('./utils');
var Loc = require('./loc');
var Wait = require('./wait');
var Diff = require('levenlistdiff');
var P = Utils.P;
var debug = Utils.debug;

module.exports = State;

var INIT = "init";
var READY = "ready";
var BUILD = "build";
var PATCH = "patch";
var SETUP = "setup";
var CLOSE = "close";
var ERROR = "error";
var HASH = "hash";
var Stages = [INIT, READY, BUILD, PATCH, SETUP, HASH, ERROR, CLOSE];
var NodeEvents = [BUILD, PATCH, SETUP, HASH, CLOSE];

var queue;
var uiQueue;

function State() {
	this.data = {};
	this.ui = {};
	this.chains = {};
	this.query = {};
	var ok, fail;
	this.queue = new Promise(function(resolve, reject) {
		ok = resolve;
		fail = reject;
	});
	this.queue.ok = ok;
	this.queue.fail = fail;
}

State.prototype.init = function(opts) {
	var W = State.Page;
	var state = this;
	if (opts.data) Object.assign(this.data, opts.data);

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

	W.disconnect = function(listener) {
		state.disconnect(listener);
	};
};

State.prototype.connect = function(listener, node) {
	var methods = [];
	if (!node) node = listener;
	var proto = listener.constructor;
	proto = proto === Object ? listener : proto.prototype;
	Object.getOwnPropertyNames(proto).filter(function(name) {
		if (name.startsWith('handle') && name != 'handleEvent') {
			methods.push([name, name.slice(6).toLowerCase(), false]);
		} else if (name.startsWith('capture') && name != 'captureEvent') {
			methods.push([name, name.slice(7).toLowerCase(), true]);
		}
	});
	if (methods.length) this.chain(SETUP, function(state) {
		methods.forEach(function(name) {
			name[3] = function(e) {
				var last = state;
				while (last.follower) last = last.follower;
				listener[name[0]].call(listener, e, last);
			};
			node.addEventListener(name[1], name[3], name[2]);
		});
	});
	var _close = listener.close;
	listener.close = function() {
		methods.forEach(function(name) {
			node.removeEventListener(name[1], name[3], name[2]);
		});
		if (_close) return _close.apply(listener, Array.from(arguments));
	};
	NodeEvents.forEach(function(k) {
		if (node[k]) this.chain(k, listener);
	}, this);
};

State.prototype.disconnect = function(listener) {
	NodeEvents.forEach(function(k) {
		if (listener[k]) {
			if (k == CLOSE) this.chain(k, listener);
			else this.unchain(k, listener);
		}
	}, this);
};

State.prototype.run = function(opts) {
	var state = this;
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

function prerender(ok) {
	var root = document.documentElement;
	if (ok === undefined) ok = root.dataset.prerender == 'true';
	else if (ok === true) root.setAttribute('data-prerender', 'true');
	else if (ok === false) root.removeAttribute('data-prerender');
	return ok;
}

function run(state, opts) {
	if (!opts) opts = {};
	state.init(opts);
	var refer = state.referrer;

	if (!refer) {
		debug("new referrer");
		state.referrer = refer = state.copy();
		delete refer.hash;
	}
	if (refer == state) {
		throw new Error("state and referrer should be distinct");
	}

	var prerendered, samePathname, sameQuery, sameHash;
	var vary = opts.vary;
	if (vary === true) {
		vary = BUILD;
		prerender(false);
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
	} else {
		delete state.emitter; // in case state had an emitter - shouldn't happen
	}

	Wait.dom().then(function() {
		prerendered = prerender();
		return state.runChain(INIT);
	}).then(function() {
		if (!samePathname || !prerendered) {
			return state.router();
		}
	}).then(function(doc) {
		if (doc && doc != document) return load(state, doc);
	}).then(function(doc) {
		if (doc) prerendered = prerender();
		debug("prerendered", prerendered);
		return state.runChain(READY);
	}).then(function() {
		if (!prerendered || !samePathname) return state.runChain(BUILD);
	}).then(function() {
		if (!prerendered || !sameQuery) return state.runChain(PATCH);
		else state.initChain(PATCH);
	}).then(function() {
		prerender(true);
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
	var e = new CustomEvent(name, {
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
	var chain = this.chains[name];
	if (!chain) chain = this.chains[name] = {};
	chain.count = 0;
	chain.promise = P();
	return chain;
};

State.prototype.runChain = function(name) {
	this.stage = name;
	var chain = this.initChain(name);
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
	return chain.promise.then(function() {
		var done = chain.done;
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
	var state = this;
	var ls = fn._pageListeners;
	if (!ls) ls = fn._pageListeners = {};
	var lfn = ls[stage];
	var emitter = document.currentScript;
	if (!emitter) {
		emitter = state.emitter;
		if (!emitter) emitter = state.emitter = document.createElement('div');
	}

	if (!lfn) {
		lfn = ls[stage] = {
			fn: chainListener(stage, fn),
			em: emitter
		};
		emitter.addEventListener('page' + stage, lfn.fn);
	} else {
		debug("already chained", stage, fn);
	}
	var p = P();
	var chain = this.chains[stage];
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
	var state = this;
	var stage = this.stage;
	var chain = this.chains[stage];
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

State.prototype.unchain = function(stage, fn) {
	var ls = fn._pageListeners;
	if (!ls) return;
	var lfn = ls[stage];
	if (!lfn) return;
	delete ls[stage];
	lfn.em.removeEventListener('page' + stage, lfn.fn);
	delete lfn.fn; // so that already reached chains can be unchained before execution
};

function chainListener(stage, fn) {
	return function(e) {
		var state = e.detail;
		var chain = state.chains[stage];
		if (chain.count == null) chain.count = 0;
		chain.count++;
		chain.promise = chain.promise.then(function() {
			return runFn(stage, fn, state);
		}).catch(function(err) {
			// eslint-disable-next-line no-console
			console.error("Page." + stage, err);
		});
		return chain.promise;
	};
}

function runFn(stage, fn, state) {
	if (fn[stage] && typeof fn[stage] == "function") {
		if (stage == CLOSE) state.unchain(stage, fn);
		return fn[stage](state);
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
	var states = {};
	var selector = 'script:not([type]),script[type="text/javascript"],link[rel="import"]';
	Utils.all(document, selector).forEach(function(node) {
		var src = node.src || node.href;
		if (src) states[src] = true;
	});

	// if there is no HTMLImports support, some loaded script might contain
	// the HTMLImports polyfill itself, which will load imports however it likes
	// so it's hard to decide which order is good, and it's also impossible to know
	// if that polyfill will be available - so load(state) does not preload
	// imports nor does it let them run on insert
	// if there is native support then it's like other resources.

	var nodes = Utils.all(doc, selector);

	nodes.forEach(function(node) {
		// just preload everything
		if (node.nodeName == "SCRIPT") {
			node.setAttribute('type', "none");
		} else if (node.nodeName == "LINK") {
			node.setAttribute('rel', 'none');
			if (!node.import) return; // polyfill already do preloading
		}
		var src = node.src || node.href;
		if (!src) return;
		if (states[src] === true) return;
		var loc = Loc.parse(src);
		if (loc.protocol == "data:") return;
		if (Loc.sameDomain(loc, state)) states[src] = Utils.get(src, 400).then(function() {
			debug("preloaded", src);
		}).catch(function(err) {
			debug("not preloaded", src, err);
		});
	});

	function loadNode(node) {
		var p = P();
		var src = node.src || node.href;
		var state = states[src];
		var old = state === true;
		var loader = !old && state;
		if (loader) {
			p = p.then(loader);
		}
		return p.then(function() {
			var parent = node.parentNode;
			var cursor;
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
			var copy = document.createElement(node.nodeName);
			for (var i=0; i < node.attributes.length; i++) {
				copy.setAttribute(node.attributes[i].name, node.attributes[i].value);
			}
			if (node.textContent) copy.textContent = node.textContent;
			var rp;
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

	var root = document.documentElement;
	var nroot = document.adoptNode(doc.documentElement);
	var head = nroot.querySelector('head');
	var body = nroot.querySelector('body');

	state.updateAttributes(root, nroot);

	var parallels = Wait.styles(head, document.head);
	var serials = Utils.all(nroot, 'script[type="none"],link[rel="none"]');
	var oldstyles = [];

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
		var p = P();
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
	var from = document.head;
	var to = node;
	var collect = [];
	Diff(from.children, to.children, function(node) {
		var key = node.src || node.href;
		if (key) return node.nodeName + '_' + key;
		else return node.outerHTML;
	}).forEach(function(patch) {
		var node = from.children[patch.index];
		switch (patch.type) {
		case Diff.INSERTION:
			from.insertBefore(patch.item, node);
			break;
		case Diff.SUBSTITUTION:
			if (node.nodeName == "LINK" && node.rel == "stylesheet") {
				from.insertBefore(patch.item, node);
				collect.push(node);
			} else {
				from.replaceChild(patch.item, node);
			}
			break;
		case Diff.DELETION:
			if (node.nodeName == "LINK" && node.rel == "stylesheet") {
				collect.push(node);
			} else {
				node.remove();
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
	var map = {};
	Array.from(to.attributes).forEach(function(att) {
		map[att.name] = att.value;
	});
	Array.from(from.attributes).forEach(function(att) {
		var val = map[att.name];
		if (val === undefined) {
			from.removeAttribute(att.name);
		} else if (val != att.value) {
			from.setAttribute(att.name, val);
		}
		delete map[att.name];
	});
	for (var name in map) from.setAttribute(name, map[name]);
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
	var vary = opts.vary;
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
	var refer = this.referrer;
	if (!refer.stage) {
		debug("Default router starts after navigation");
		return;
	}
	var url = Loc.format(this);
	return Utils.get(url, 500, 'text/html').then(function(client) {
		var doc;
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
		var state = stateFrom(e.state) || Loc.parse();
		state.referrer = this;
		state.run().catch(function(err) {
			// eslint-disable-next-line no-console
			console.error(err);
			var url = Loc.format(state);
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
	var state = Loc.parse(from.href);
	delete from.href;
	Object.assign(state, from);
	return state;
}

function historySave(method, state) {
	if (!window.history) return false;
	var to = stateTo(state);
	debug("history", method, to);
	window.history[method + 'State'](to, document.title, to.href);
	return true;
}

function historyMethod(method, loc, refer, opts) {
	if (!refer) throw new Error("Missing referrer parameter");
	var copy = Loc.parse(Loc.format(loc));
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
		var url = Loc.format(copy);
		setTimeout(function() {
			if (method == "replace") document.location.replace(url);
			else document.location.assign(url);
		}, 50);
	});
}

