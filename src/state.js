var Utils = require('./utils');
var Loc = require('./loc');
var Wait = require('./wait');
var Diff = require('levenlistdiff');
var P = Utils.P;
var debug = Utils.debug;

module.exports = State;

function State() {
	this.data = {};
}

var INIT = "init";
var BUILD = "build";
var PATCH = "patch";
var SETUP = "setup";
var CLOSE = "close";
var ERROR = "error";
var HASH = "hash";
var Stages = [INIT, BUILD, PATCH, SETUP, HASH, ERROR, CLOSE];

State.prototype.init = function(W) {
	var state = this;
	Stages.forEach(function(stage) {
		W[stage] = function(fn) {
			return state.chain(stage, fn);
		};
		W['un' + stage] = function(fn) {
			return state.unchain(stage, fn);
		};
	});
};

State.prototype.run = function(W) {
	var state = this;
	var url = Loc.format(state); // converts path if any
	var refer = W.state || document.referrer;
	if (!W.state) {
		W.state = Loc.parse(this);
		delete W.state.hash;
	}
	refer = W.referrer = refer ? Loc.parse(refer) : W.state;
	return Wait.dom().then(function() {
		Utils.trackListeners(document.body);
		// not sure state.stage must be set here
		state.initialStage = state.stage = W.stage();
		debug("doc ready at stage", state.initialStage);

		if (!Loc.sameDomain(refer, state)) {
			throw new Error("Cannot route to a different domain:\n" + url);
		}

		if (refer.pathname != state.pathname) {
			state.stage = INIT;
		}
		if (state.stage == INIT) {
			if (refer.stage == SETUP) {
				W.stage(CLOSE);
				return refer.runChain(CLOSE);
			}
		}
	}).then(function() {
		var prevStage = state.stage;
		return (W.runChain(INIT, state) || P()).then(function() {
			state.stage = prevStage;
		});
	}).then(function() {
		if (state.stage != INIT) return;
		W.stage(INIT);
		if (state.initialStage !== INIT && W.state.pathname == state.pathname) {
			debug("refer has same pathname", state.pathname);
			return;
		}
		return state.route();
	}).then(function(doc) {
		var prev = W.state;
		state.emitter = prev.emitter;
		W.state = state;
		if (state.stage != INIT) return;
		if (prev.stage) delete state.emitter;
		Utils.clearListeners(document.body);
		if (!doc) return;
		state.stage = INIT;
		return state.load(doc).then(function() {
			var docStage = W.stage();
			debug("imported doc at stage", docStage);
			if (docStage == INIT) {
				return state.route();
			}
			state.stage = docStage;
		});
	}).then(function() {
		if (state.stage != INIT) return;
		return (state.runChain(BUILD) || P()).then(function() {
			return state.runChain(PATCH);
		}).then(function() {
			W.stage(BUILD);
		});
	}).then(function() {
		if (state.stage == SETUP) {
			if (!Loc.samePath(state, refer)) {
				return state.runChain(PATCH) || state.runChain(BUILD);
			}
		} else return Wait.ui().then(function() {
			if (state._abort) return Promise.reject("abort");
			return (state.runChain(SETUP) || P()).then(function() {
				W.stage(SETUP);
			});
		});
	}).then(function() {
		if (state.hash != refer.hash) return state.runChain(HASH);
	}).catch(function(err) {
		delete state._abort;
		if (err != "abort") {
			// eslint-disable-next-line no-console
			if (typeof err != "number") console.error(err);
			state.error = err;
			state.runChain(ERROR)
		}
	}).then(function() {
		return state;
	});
};

State.prototype.abort = function() {
	if (this.stage != BUILD) return false;
	this._abort = true;
	return true;
};

State.prototype.emit = function(name) {
	var e = new CustomEvent(name, {
		view: window,
		bubbles: true,
		cancelable: true,
		detail: this
	});
	e.state = this; // backward compat
	Utils.all(document, 'script').forEach(function(node) {
		node.dispatchEvent(e);
	});
	if (this.emitter) this.emitter.dispatchEvent(e);
};

State.prototype.runChain = function(name) {
	this.stage = name;
	var chain = this.chains[name];
	if (!chain) chain = this.chains[name] = {};
	debug("run chain", name);
	chain.count = 0;
	chain.promise = P();
	this.emit("page" + name);
	debug("run chain count", name, chain.count);
	if (chain.count) return chain.promise;
};


State.prototype.chain = function(stage, fn) {
	var state = this;
	var ls = fn.pageListeners;
	if (!ls) ls = fn.pageListeners = {};
	var lfn = ls[stage];
	var emitter = document.currentScript;
	if (!emitter) {
		emitter = state.emitter;
		if (!emitter) emitter = state.emitter = document.createElement('div');
	}

	if (!lfn) {
		lfn = ls[stage] = {
			fn: state.listener(stage, fn),
			em: emitter
		};
		emitter.addEventListener('page' + stage, lfn.fn);
	} else {
		debug("already chained", stage, fn);
	}
	var p;
	var curNum = state.stage ? Stages.indexOf(state.stage) : 0;
	var tryNum = Stages.indexOf(stage);
	if (tryNum <= curNum) {
		debug("chain has run, execute fn now", stage);
		p = new Promise(function(resolve) {
			setTimeout(resolve);
		}).then(function() {
			return fn(state);
		});
	} else {
		debug("chain pending", stage);
		p = P();
	}
	return p;
};

State.prototype.unchain = function(stage, fn) {
	var ls = fn.pageListeners;
	if (!ls) return;
	var lfn = ls[stage];
	if (!lfn) return;
	delete ls[stage];
	lfn.em.removeEventListener('page' + stage, lfn.fn);
};

State.prototype.listener = function(stage, fn) {
	var me = this;
	return function(e) {
		var chain = me.chains[stage];
		if (chain.count == null) chain.count = 0;
		chain.count++;
		chain.promise = chain.promise.then(function() {
			return fn(e.detail);
		}).catch(function(err) {
			// eslint-disable-next-line no-console
			console.error("Uncaught error during", stage, err, fn);
		});
	};
};

State.prototype.route = function(loc) {
	var url = Loc.format(loc);
	return Utils.get(url, 500).then(function(client) {
		var doc = Utils.parseDoc(client.responseText);
		if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
			throw new Error(client.statusText);
		} else if (!doc) {
			setTimeout(function() {
				document.location = url;
			}, 500);
			throw new Error("Cannot load remote document - redirecting...");
		}
		return doc;
	});
};


State.prototype.load = function(doc) {
	if (doc == document) {
		debug("Do not import same document");
		return P();
	}
	debug("Import new document");
	var states = {};
	var selector = 'script:not([type]),script[type="text/javascript"],link[rel="import"]';
	Utils.all(document, selector).forEach(function(node) {
		var src = node.src || node.href;
		if (src) states[src] = true;
	});

	// if there is no HTMLImports support, some loaded script might contain
	// the HTMLImports polyfill itself, which will load imports however it likes
	// so it's hard to decide which order is good, and it's also impossible to know
	// if that polyfill will be available - so state.load does not preload
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
		// not data-uri
		if (src.slice(0, 5) == 'data:') return;
		states[src] = Utils.get(src, 400).then(function() {
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

	Utils.trackListeners(body);

	var atts = nroot.attributes;

	for (var i=0; i < atts.length; i++) {
		root.setAttribute(atts[i].name, atts[i].value);
	}
	atts = Array.prototype.slice.call(this.root.attributes);
	for (var j=0; j < atts.length; j++) {
		if (!nroot.hasAttribute(atts[j].name)) nroot.removeAttribute(atts[j].name);
	}

	var parallels = Wait.styles(head, document.head);
	var serials = Utils.all(nroot, 'script[type="none"],link[rel="none"]');

	var state = this;

	return P().then(function() {
		state.setHead(head);
		return parallels;
	}).then(function() {
		return P().then(function() {
			return state.setBody(body);
		});
	}).then(function() {
		// scripts must be run in order
		var p = P();
		serials.forEach(function(node) {
			p = p.then(function() {
				return loadNode(node);
			});
		});
		return p;
	});
};

State.prototype.setHead = function(node) {
	this.updateAttributes(document.head, node);
	this.updateChildren(document.head, node);
};

State.prototype.setBody = function(node) {
	document.body.parentNode.replaceChild(node, document.body);
};

State.prototype.updateAttributes = function(from, to) {
	var attFrom = from.attributes;
	var attTo = to.attributes;
	Diff(attFrom, attTo, function(att) {
		return att.name + "_" + att.value;
	}).forEach(function(patch) {
		var att = attFrom[patch.index];
		switch (patch.type) {
		case Diff.INSERTION:
			if (patch.item.value) {
				from.setAttribute(patch.item.name, patch.item.value);
			}
			break;
		case Diff.SUBSTITUTION:
			if (att.name != patch.item.name) {
				from.removeAttribute(att.name);
			}
			if (patch.item.value) {
				from.setAttribute(patch.item.name, patch.item.value);
			} else {
				from.removeAttribute(patch.item.name);
			}
			break;
		case Diff.DELETION:
			from.removeAttribute(att.name);
			break;
		}
	});
};

State.prototype.updateChildren = function(from, to) {
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
			from.replaceChild(patch.item, node);
			break;
		case Diff.DELETION:
			node.remove();
			break;
		}
	});
};

