(function() {
var QueryString = require('query-string');

var INIT = 0;
var IMPORTED = 1;
var BUILT = 2;
var SETUP = 3;

var urlHelper = document.createElement('a');

function PageClass() {
	this.name = "PageClass";
	this.prefix = 'data-page-';
	this.window = window;
	this.debug = false;
	this.reset();

	this.route = this.chainThenable.bind(this, "route");
	this.build = this.chainThenable.bind(this, "build");
	this.patch = this.chainThenable.bind(this, "patch");
	this.setup = this.chainThenable.bind(this, "setup");
	this.format = this.format.bind(this);
	this.historyListener = this.historyListener.bind(this);

	if (this.window.history) {
		this.supportsHistory = true;
		this.window.addEventListener('popstate', this.historyListener);
	}

	var state = this.parse();
	this.run(state);
}

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

PageClass.prototype.store = function(name, data) {
	var storage = this.storage;
	if (!storage) this.storage = storage = {};
	if (data === undefined) {
		if (storage[name] !== undefined) return storage[name];
	}
	var root = this.root;
	if (!root) {
		this.root = root = document.querySelector(
			'[' + this.prefix + 'stage' + ']'
		) || document.documentElement;
	}
	if (data === undefined) {
		try {
			data = this.storage[name] = JSON.parse(root.getAttribute(this.prefix + name));
		} catch (ex) {}
	} else if (data === null) {
		delete this.storage[name];
		root.removeAttribute(this.prefix + name);
	} else {
		this.storage[name] = data;
		root.setAttribute(this.prefix + name, JSON.stringify(data));
	}
	return data;
};

PageClass.prototype.stage = function(stage) {
	return this.store('stage', stage) || INIT;
};

PageClass.prototype.parse = function(str) {
	var dloc = this.window.document.location;
	var loc = urlHelper;
	loc.href = str || "";
	var obj = {
		pathname: loc.pathname,
		query: QueryString.parse(loc.search),
		hash: loc.hash
	};
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
	this.format(state); // converts path if any
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
	this.queue = this.waitReady().then(function() {
		state.initialStage = state.stage = self.stage();
		if (state.stage == INIT) {
			self.emit("pageinit", state);
			return self.runChain('route', state);
		}
	}).then(function() {
		if (state.stage >= IMPORTED || !state.document) return;
		self.reset();
		return self.importDocument(state.document).then(function() {
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
			return self.runChain('setup', state).then(function() {
				if (state.stage < SETUP) {
					state.stage = SETUP;
					self.stage(SETUP);
				}
			});
		});
	}).then(function() {
		self.state = state;
		self.queue = null;
	}).catch(function(err) {
		delete state.abort;
		if (err != "abort") {
			console.error(err);
			self.emit("pageerror", state);
		}
	});
	return this.queue;
};

PageClass.prototype.reset = function() {
	this.chains = {
		route: {thenables: []},
		build: {thenables: []},
		patch: {thenables: []},
		setup: {thenables: []}
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
	var chain = this.chains[name];
	chain.thenables.push(fn);
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
	list.forEach(function(fn) {
		p = self.oneFn(p, name, fn);
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
	// https://github.com/jquery/jquery/issues/2100
	if (document.readyState == "complete" ||
		(document.readyState != "loading" && !document.documentElement.doScroll)) {
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

PageClass.prototype.importDocument = function(doc) {
	// document to be imported will have some nodes with custom props
	// and before it is actually imported these props are removed
	var states = {};
	queryAll(document, 'script,link[rel="stylesheet"],link[rel="import"]').forEach(function(node) {
		var src = node.src || node.href;
		if (src) states[src] = true;
	});

	var nodes = queryAll(doc, 'script,link[rel="stylesheet"],link[rel="import"]');

	// if there is no HTMLImports support, some loaded script might contain
	// the HTMLImports polyfill itself, which will load imports however it likes
	// so it's hard to decide which order is good, and it's also impossible to know
	// if that polyfill will be available - so importDocument does not preload
	// imports nor does it let them run on insert
	// if there is native support then it's like other resources.

	// first make sure nodes won't load when inserted into live document
	nodes.map(function(node) {
		// just preload everything
		if (node.nodeName == "SCRIPT") {
			node._type = node.type;
			node.setAttribute('type', "none");
		} else if (node.nodeName == "LINK") {
			node._rel = node.getAttribute('rel');
			node._href = node.getAttribute('href');
			node.setAttribute('rel', 'none');
			node.removeAttribute('href');
		}
	});
	// then import
	var root = document.documentElement;
	while (root.attributes.length > 0) {
		root.removeAttribute(root.attributes[0].name);
	}
	var docRoot = doc.documentElement;
	if (docRoot.attributes) for (var i=0; i < docRoot.attributes.length; i++) {
		root.setAttribute(docRoot.attributes[i].name, docRoot.attributes[i].value);
	}

	root.replaceChild(document.adoptNode(doc.head), document.head);
	root.replaceChild(document.adoptNode(doc.body), document.body);

	// load all
	nodes.forEach(function(node) {
		var src = node.src || node.href;
		if (!src) return;
		if (states[src] === true) return;
		// not imports if there is no native support because polyfill already do preloading
		if (node.nodeName == "LINK" && node._rel == "import" && !node.import) return;
		// not data-uri
		if (src.slice(0, 5) == 'data:') return;
		states[src] = pGet(src).then(function() {
			debug("preloaded", src);
		}).catch(function(err) {
			debug("error preloading", src, err);
		});
	});

	var chain = Promise.resolve();
	queryAll(document, 'script[type="none"],link[rel="none"]').forEach(function(node) {
		var src = node.src || node.href;
		var state = states[src];
		var old = state === true;
		var loader = !old && state;
		if (loader) {
			chain = chain.then(loader);
		}
		chain = chain.then(function() {
			var parent = node.parentNode;
			var cursor;
			if (!old) {
				cursor = document.createTextNode("");
				parent.insertBefore(cursor, node);
				parent.removeChild(node);
			}
			restoreAttr(node, 'rel');
			restoreAttr(node, 'href');
			restoreAttr(node, 'type');
			if (old) return;
			var copy = document.createElement(node.nodeName);
			for (var i=0; i < node.attributes.length; i++) {
				copy.setAttribute(node.attributes[i].name, node.attributes[i].value);
			}
			if (node.textContent) copy.textContent = node.textContent;
			var p;
			if (src) {
				debug("async node loading", src);
				if (node.nodeName == "LINK" && node.rel == "import" && !node.import) {
					debug("not loading import", src);
				} else {
					p = readyNode(copy);
				}
			} else {
				debug("inline node loading");
				p = new Promise(function(resolve) {
					setTimeout(resolve);
				});
			}
			parent.insertBefore(copy, cursor);
			parent.removeChild(cursor);
			if (p) return p;
		});
	});
	return chain;
};

PageClass.prototype.push = function(state) {
	return this.historyMethod('push', state);
};

PageClass.prototype.replace = function(state) {
	return this.historyMethod('replace', state);
};

PageClass.prototype.historyMethod = function(method, obj) {
	var copy = this.parse(typeof obj == "string" ? obj : this.format(obj));
	if (this.state) {
		if (this.state.data != null) copy.data = this.state.data;
		copy.stage = this.state.stage;
	}

	if (this.supportsHistory && !this.initializedHistory && method == "push") {
		// to be able to go back, the initial state must be set in history
		this.initializedHistory = true;
		// we want current location here
		var to = this.stateTo(this.state);
		// ensure it calls patch or build chain
		if (to.stage == BUILT) to.stage = SETUP;
		to.href = this.format(this.parse(document.location.toString()));
		this.window.history.replaceState(to, document.title, to.href);
	}

	return this.run(copy).then(function() {
		var to = this.stateTo(copy);
		if (this.supportsHistory) {
			this.window.history[method + 'State'](to, document.title, to.href);
		}
	}.bind(this));
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

function restoreAttr(node, attr) {
	var val = node['_' + attr];
	if (val === undefined) return;
	delete node['_' + attr];
	if (val) node.setAttribute(attr, val);
	else node.removeAttribute(attr);
}

function queryAll(doc, selector) {
	if (doc.queryAll) return doc.queryAll(selector);
	var list = doc.querySelectorAll(selector);
	if (Array.from) return Array.from(list);
	return Array.prototype.slice.call(list);
}

function pGet(url) {
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		xhr.onreadystatechange = function() {
			if (this.readyState != 4) return;
			var code = this.status;
			if (code >= 200 && code < 400) resolve(this.responseText);
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

})();
