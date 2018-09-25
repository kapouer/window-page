var QueryString = require('query-string');
var Diff = require('levenlistdiff');

var INIT = 0;
var IMPORTED = 1;
var BUILT = 2;
var SETUP = 3;
var CLOSING = 4;

var urlHelper = document.createElement('a');

function PageClass() {
	this.name = "PageClass";
	this.window = window;
	this.debug = false;
	this.listeners = [];
	this.reset();

	this.route = this.chainThenable.bind(this, "route");
	this.build = this.chainThenable.bind(this, "build");
	this.patch = this.chainThenable.bind(this, "patch");
	this.setup = this.chainThenable.bind(this, "setup");
	this.close = this.chainThenable.bind(this, "close");
	this.format = this.format.bind(this);
	this.historyListener = this.historyListener.bind(this);

	if (this.window.history) {
		this.supportsHistory = true;
		this.window.addEventListener('popstate', this.historyListener);
	}

	var state = this.parse();
	this.run(state).then(function() {
		if (!this.window.history.state) {
			this.historySave("replace", state);
		}
	}.bind(this));
}

PageClass.prototype.trackListeners = function(node) {
	this.listeners.forEach(function(obj) {
		obj.node.removeEventListener(obj.evt, obj.fn, obj.opts);
	});
	this.listeners = [];
	var me = this;
	var meth = node.addEventListener;
	if (meth == Node.prototype.addEventListener) node.addEventListener = function(evt, fn, opts) {
		me.listeners.push({node: node, evt: evt, fn: fn, opts: opts});
		return meth.call(node, evt, fn, opts);
	};
};

PageClass.prototype.stage = function(stage) {
	var root = this.root;
	if (!root) {
		this.root = root = document.querySelector('[data-page-stage]') || document.documentElement;
	}
	if (stage != null) this.root.setAttribute('data-page-stage', stage);
	else stage = parseInt(this.root.dataset.pageStage);
	return isNaN(stage) ? INIT : stage;
};

PageClass.prototype.parse = function(str) {
	var dloc = this.window.document.location;
	var loc = urlHelper;
	loc.href = str || "";
	var obj = {
		pathname: loc.pathname,
		query: QueryString.parse(loc.search),
		hash: loc.hash
	};
	if (!obj.pathname) obj.pathname = "/";
	else if (obj.pathname[0] != "/") obj.pathname = "/" + obj.pathname;
	if (obj.hash && obj.hash[0] == "#") obj.hash = obj.hash.substring(1);

	if (this.sameDomain(loc, dloc)) {
		delete obj.port;
		delete obj.hostname;
		delete obj.protocol;
	} else {
		if (!obj.hostname) {
			obj.hostname = loc.hostname;
			if (!obj.port) obj.port = loc.port;
		}
		if (!obj.protocol) obj.protocol = loc.protocol;
		if (!obj.port || obj.port == "80") delete obj.port;
	}
	return obj;
};

PageClass.prototype.format = function(obj) {
	var dloc = this.window.document.location;
	obj = Object.assign({}, obj);
	if (obj.path) {
		var parsedPath = this.parse(obj.path);
		obj.pathname = parsedPath.pathname;
		obj.query = parsedPath.query;
		obj.hash = parsedPath.hash;
		delete obj.path;
	}
	var search = QueryString.stringify(obj.query || {});
	obj.search = search || "";

	var keys = ["pathname", "search", "hash"];
	var relative = !obj.protocol && !obj.hostname && !obj.port;
	if (!relative) keys.unshift("protocol", "hostname", "port");

	var key;
	for (var i=0; i < keys.length; i++) {
		key = keys[i];
		if (obj[key] == null) obj[key] = dloc[key];
		else break;
	}

	var str = obj.pathname || "";
	if (search) str += '?' + search;
	if (obj.hash) str += '#' + obj.hash;
	if (!relative) {
		var port = (obj.port && obj.port != 80) ? ":" + obj.port : "";
		str = obj.protocol + '//' + obj.hostname + port + str;
	}
	return str;
};

PageClass.prototype.samePath = function(a, b) {
	if (typeof a == "string") a = this.parse(a);
	if (typeof b == "string") b = this.parse(b);
	var aquery = a.query || QueryString.parse(a.search);
	var bquery = b.query || QueryString.parse(b.search);
	return a.pathname == b.pathname &&
		QueryString.stringify(aquery) == QueryString.stringify(bquery);
};

PageClass.prototype.sameDomain = function(a, b) {
	if (typeof a == "string") a = this.parse(a);
	if (typeof b == "string") b = this.parse(b);
	var loc = document.location;
	var pr = loc.protocol;
	var hn = loc.hostname;
	var po = loc.port;
	return (a.protocol || pr) == (b.protocol || pr) && (a.hostname || hn) == (b.hostname || hn) && (a.port || po) == (b.port || po);
};

PageClass.prototype.emit = function(name, state) {
	var event = document.createEvent('Event');
	event.initEvent(name, true, true);
	event.state = state;
	window.dispatchEvent(event);
};

PageClass.prototype.run = function(state) {
	var url = this.format(state); // converts path if any
	if (!state.data) state.data = {};
	var self = this;
	if (this.queue) {
		if (this.state && this.state.stage == BUILT) {
			this.state.abort = true;
		} else {
			return this.queue.then(function() {
				return self.run(state);
			});
		}
	}
	var curState;
	this.queue = this.waitReady().then(function() {
		state.initialStage = state.stage = self.stage();
		curState = self.state || self.parse();
		if (!self.sameDomain(curState, state)) {
			throw new Error("Cannot route to a different domain:\n" + url);
		}
		if (curState.pathname != state.pathname) {
			state.stage = INIT;
		}
		if (state.stage == INIT && curState.stage == SETUP) {
			self.stage(CLOSING);
			return self.runChain('close', curState);
		}
	}).then(function() {
		if (state.stage != INIT) return;
		self.emit("pageinit", state);
		return Promise.resolve().then(function() {
			if (curState.pathname == state.pathname) return; // nothing to do
			if (self.chains.route.thenables.length == 0) {
				return pGet(url, 500).then(function(client) {
					var doc = document.cloneNode(false);
					if (!doc.documentElement) doc.appendChild(doc.createElement('html'));
					doc.documentElement.innerHTML = client.responseText;
					if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
						throw new Error(client.statusText);
					}
					state.document = doc;
				});
			}
		}).then(function() {
			self.stage(INIT);
			return self.runChain('route', state);
		});
	}).then(function() {
		if (state.stage >= IMPORTED || !state.document) return;
		return self.importDocument(state.document, state).then(function() {
			debug("importDocument done");
			delete state.document;
			var docStage = self.stage();
			if (docStage == INIT) {
				docStage = IMPORTED;
				self.stage(IMPORTED);
			}
			state.stage = docStage;
		});
	}).then(function() {
		if (state.stage >= BUILT) return;
		return self.runChain('build', state).then(function() {
			return self.runChain('patch', state);
		}).then(function() {
			if (state.stage < BUILT) {
				state.stage = BUILT;
				self.stage(BUILT);
			}
		});
	}).then(function() {
		if (state.stage == SETUP) {
			// run patch if any, or build
			return self.runChain(self.chains.patch.thenables.length ? 'patch' : 'build', state);
		} else return self.waitUiReady().then(function() {
			if (state.abort) return Promise.reject("abort");
			self.trackListeners(document.body);
			return self.runChain('setup', state).then(function() {
				if (state.stage < SETUP) {
					state.stage = SETUP;
					self.stage(SETUP);
				}
			});
		});
	}).catch(function(err) {
		delete state.abort;
		if (err != "abort") {
			if (typeof err != "number") console.error(err);
			state.error = err;
			self.emit("pageerror", state);
		}
	}).then(function() {
		self.state = state;
		self.queue = null;
	});
	return this.queue;
};

PageClass.prototype.reset = function(map) {
	// all thenables coming from a src in map are removed
	if (!map) map = {};
	function filterBy(obj) {
		if (!obj.src) return false;
		if (map[obj.src]) return false;
		return true;
	}
	var chains = this.chains || {
		route: {thenables: []},
		build: {thenables: []},
		patch: {thenables: []},
		setup: {thenables: []},
		close: {thenables: []}
	};
	this.chains = {
		route: {thenables: chains.route.thenables.filter(filterBy)},
		build: {thenables: chains.build.thenables.filter(filterBy)},
		patch: {thenables: chains.patch.thenables.filter(filterBy)},
		setup: {thenables: chains.setup.thenables.filter(filterBy)},
		close: {thenables: chains.close.thenables.filter(filterBy)}
	};
};

PageClass.prototype.runChain = function(name, state) {
	debug("run chain", name);
	var chain = this.chains[name];
	chain.promise = this.allFn(state, name, chain.thenables);
	return chain.promise.then(function() {
		this.emit("page" + name, state);
		return state;
	}.bind(this));
};

PageClass.prototype.chainThenable = function(name, fn) {
	var src = document.currentScript;
	if (src) src = src.src;
	var chain = this.chains[name];
	var obj = {
		fn: fn,
		src: src
	};
	chain.thenables.push(obj);
	if (chain.promise) {
		chain.promise = this.oneFn(chain.promise, name, fn);
	}
	return this;
};

PageClass.prototype.catcher = function(name, err, fn) {
	console.error("Uncaught error during", name, err, fn);
};

PageClass.prototype.oneFn = function(p, name, fn) {
	var catcher = this.catcher.bind(this);
	return p.then(function(state) {
		return Promise.resolve(state).then(fn).catch(function(err) {
			return catcher(name, err, fn);
		}).then(function() {
			return state;
		});
	});
};

PageClass.prototype.allFn = function(state, name, list) {
	var p = Promise.resolve(state);
	var self = this;
	list.forEach(function(obj) {
		p = self.oneFn(p, name, obj.fn);
	});
	return p;
};

PageClass.prototype.waitUiReady = function() {
	if (document.visibilityState == "prerender") {
		var solve, p = new Promise(function(resolve) { solve = resolve; });
		function vizListener() {
			document.removeEventListener('visibilitychange', vizListener, false);
			solve();
		}
		document.addEventListener('visibilitychange', vizListener, false);
	} else {
		p = Promise.resolve();
	}
	return p;
};

PageClass.prototype.waitImports = function() {
	var imports = queryAll(document, 'link[rel="import"]');
	var polyfill = window.HTMLImports;
	var whenReady = (function() {
		var promise;
		return function() {
			if (!promise) promise = new Promise(function(resolve) {
				polyfill.whenReady(function() {
					setTimeout(resolve);
				});
			});
			return promise;
		};
	})();

	return Promise.all(imports.map(function(link) {
		if (link.import && link.import.readyState == "complete") {
			// no need to wait, wether native or polyfill
			return Promise.resolve();
		}
		if (polyfill) {
			// link.onload cannot be trusted
			return whenReady();
		}

		return readyNode(link);
	}));
}

PageClass.prototype.waitReady = function() {
	if (this.docReady) return Promise.resolve();
	var solve;
	var p = new Promise(function(resolve) {
		solve = resolve;
	});
	if (document.readyState == "complete") {
		this.docReady = true;
		setTimeout(solve);
		return p;
	}
	var self = this;
	function listener() {
		document.removeEventListener('DOMContentLoaded', listener);
		window.removeEventListener('load', listener);
		if (self.docReady) return;
		self.docReady = true;
		solve();
	}
	document.addEventListener('DOMContentLoaded', listener);
	window.addEventListener('load', listener);
	return p.then(this.waitImports);
};

PageClass.prototype.importDocument = function(doc, state) {
	if (!state) state = this.state;
	if (doc == document) {
		return this.updateDone();
	}
	// document to be imported will have some nodes with custom props
	// and before it is actually imported these props are removed
	var states = {};
	var knowns = {};
	var selector = 'script:not([type]),script[type="text/javascript"],link[rel="import"]';
	queryAll(document, selector).forEach(function(node) {
		var src = node.src || node.href;
		if (src) knowns[src] = states[src] = true;
	});

	// if there is no HTMLImports support, some loaded script might contain
	// the HTMLImports polyfill itself, which will load imports however it likes
	// so it's hard to decide which order is good, and it's also impossible to know
	// if that polyfill will be available - so importDocument does not preload
	// imports nor does it let them run on insert
	// if there is native support then it's like other resources.

	var nodes = queryAll(doc, selector);

	nodes.forEach(function(node) {
		// just preload everything
		if (node.nodeName == "SCRIPT") {
			node.setAttribute('type', "none");
		} else if (node.nodeName == "LINK") {
			var rel = node.getAttribute('rel');
			node.setAttribute('rel', 'none');
			if (!node.import) return; // polyfill already do preloading
		}
		var src = node.src || node.href;
		if (!src) return;
		delete knowns[src];
		if (states[src] === true) return;
		// not data-uri
		if (src.slice(0, 5) == 'data:') return;
		states[src] = pGet(src, 400).then(function() {
			debug("preloaded", src);
		}).catch(function(err) {
			debug("not preloaded", src, err);
		});
	});

	function loadNode(node) {
		var p = Promise.resolve();
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
					rp = readyNode(copy);
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

	var nroot = document.adoptNode(doc.documentElement);
	var head = nroot.querySelector('head');
	var body = nroot.querySelector('body');

	this.reset(knowns);

	var root = document.documentElement;
	var atts = nroot.attributes;
	for (var i=0; i < atts.length; i++) {
		root.setAttribute(atts[i].name, atts[i].value);
	}
	atts = Array.prototype.slice.call(root.attributes);
	for (var i=0; i < atts.length; i++) {
		if (!nroot.hasAttribute(atts[i].name)) nroot.removeAttribute(atts[i].name);
	}

	var knownSheets = {};
	queryAll(document.head, 'link[rel="stylesheet"]').forEach(function(node) {
		knownSheets[node.href] = true;
	});

	var parallelsDone = Promise.all(
		queryAll(head, 'link[rel="stylesheet"]').filter(function(node) {
			return !knownSheets[node.href];
		}).map(readyNode)
	);
	var serials = queryAll(nroot, 'script[type="none"],link[rel="none"]');
	var me = this;
	var curBody = document.body;

	return Promise.resolve().then(function() {
		me.updateHead(head, state);
		return parallelsDone;
	}).then(function() {
		return Promise.resolve().then(function() {
			return me.updateBody(body, state);
		}).then(function(body) {
			if (body && body.nodeName == "BODY") {
				document.documentElement.replaceChild(body, document.body);
			}
			return me.updateDone(state);
		});
	}).then(function() {
		// scripts must be run in order
		var p = Promise.resolve();
		serials.forEach(function(node) {
			p = p.then(function() {
				return loadNode(node);
			});
		});
		return p;
	});
};

PageClass.prototype.updateHead = function(head) {
	this.updateAttributes(document.head, head);
	this.updateChildren(document.head, head);
};

PageClass.prototype.updateBody = function(body) {
	return body;
};

PageClass.prototype.updateDone = function(state) {
	return Promise.resolve();
};

PageClass.prototype.updateAttributes = function(from, to) {
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

PageClass.prototype.updateChildren = function(from, to) {
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

PageClass.prototype.push = function(newState, state) {
	return this.historyMethod('push', newState, state);
};

PageClass.prototype.replace = function(newState, state) {
	return this.historyMethod('replace', newState, state);
};

PageClass.prototype.historyMethod = function(method, newState, state) {
	var url;
	if (typeof newState == "string") {
		url = newState;
		newState = {};
	} else {
		url = this.format(newState);
	}
	var copy = this.parse(url);
	if (newState.data != null) copy.data = newState.data;
	copy.stage = newState.stage;

	if (!state) state = this.state;
	if (!this.sameDomain(state, copy)) {
		if (method == "replace") console.info("Cannot replace to a different origin");
		document.location = url;
		return Promise.resolve();
	}

	return this.run(copy).then(function() {
		this.historySave(method, copy);
	}.bind(this));
};

PageClass.prototype.historySave = function(method, state) {
	if (!this.supportsHistory) return;
	var to = this.stateTo(state);
	if (!to.stage || to.stage == BUILT) {
		to.stage = SETUP;
	}
	this.window.history[method + 'State'](to, document.title, to.href);
};

PageClass.prototype.historyListener = function(e) {
	var state = this.stateFrom(e.state);
	if (state) {
		this.run(state);
	} else {
		var state = this.parse();
		if (this.samePath(this.state, state) && this.state.hash != state.hash) {
			this.emit("pagehash", state);
			this.state.hash = state.hash;
		}
	}
};

PageClass.prototype.stateTo = function(state) {
	return {
		href: this.format(state),
		stage: state.initialStage,
		data: state.data
	};
};

PageClass.prototype.stateFrom = function(from) {
	if (!from || !from.href) return;
	var state = this.parse(from.href);
	state.stage = from.stage;
	state.data = from.data || {};
	return state;
};

function queryAll(doc, selector) {
	if (doc.queryAll) return doc.queryAll(selector);
	var list = doc.querySelectorAll(selector);
	if (Array.from) return Array.from(list);
	return Array.prototype.slice.call(list);
}

function pGet(url, statusRejects) {
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.onreadystatechange = function() {
			if (this.readyState != 4) return;
			var code = this.status;
			if (!statusRejects) statusRejects = 400;
			if (code >= 200 && code < statusRejects) resolve(this);
			else reject(code);
		};
		xhr.send();
	});
}

function readyNode(node) {
	return new Promise(function(resolve, reject) {
		function done() {
			node.removeEventListener('load', done);
			node.removeEventListener('error', done);
			resolve();
		}
		node.addEventListener('load', done);
		node.addEventListener('error', done);
	});
}

function debug() {
	if (window.Page.debug) console.info.apply(console, Array.prototype.slice.call(arguments));
}

PageClass.init = function() {
	var inst = window.Page;
	if (inst) {
		if (inst.name != "PageClass") throw new Error("window.Page already exists");
	} else {
		window.Page = new PageClass();
	}
};

PageClass.init();

