(function() {
var QueryString = require('query-string');

var INIT = 0;
var IMPORTED = 1;
var BUILT = 2;
var SETUP = 3;

function PageClass() {
	this.name = "PageClass";
	this.prefix = 'data-page-';
	this.window = window;

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
		var obj = this.parse();
		if (this.samePath(this.state, obj) && this.state.hash != obj.hash) {
			Page.state.hash = hash;
			this.emit("pagehash");
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
	} else if (data == null) {
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
	var loc = new URL(str || "", dloc.toString());
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
		if (!obj.port) obj.port = loc.port;
		if (!obj.hostname) obj.hostname = loc.hostname;
		if (!obj.protocol) obj.protocol = loc.protocol;
		if (obj.port == "80") delete obj.port;
	}
	return obj;
};

PageClass.prototype.format = function(obj) {
	var dloc = this.window.document.location;
	if (obj.path) {
		var parsedPath = this.parse(obj.path);
		obj.pathname = parsedPath.pathname;
		obj.query = parsedPath.query;
		obj.hash = parsedPath.hash;
		delete obj.path;
	}
	var search = QueryString.stringify(obj.query || {});
	if (search) obj.search = search;
	if (obj.protocol || obj.hostname || obj.port) {
		var loc = new URL("", dloc.toString());
		// copy only enumerable properties of a URL instance
		for (var k in loc) if (obj[k] !== undefined) loc[k] = obj[k];
		return loc.toString();
	}
	var str = obj.pathname || "";
	if (search) str += '?' + search;
	if (obj.hash) str += '#' + obj.hash;
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
	return (a.protocol || pr) == (b.protocol || pr)
		&& (a.hostname || hn) == (b.hostname || hn) && (a.port || po) == (b.port || po);
};

PageClass.prototype.emit = function(name) {
	var event = document.createEvent('Event');
	event.initEvent(name, true, true);
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
			self.emit("pageinit");
			return self.runChain('route', state);
		}
	}).then(function() {
		if (state.stage >= IMPORTED || !state.document) return;
		self.reset();
		return self.importDocument(state.document).then(function() {
			delete state.document;
			var docStage = self.stage();
			if (docStage == INIT) {
				docStage = IMPORTED;
				self.stage(IMPORTED);
			}
			state.stage = docStage;
		});
	}).then(function() {
		self.state = state; // this is the new current state
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
		} else return self.waitUiReady(state).then(function() {
			if (state.abort) return Promise.reject("abort");
			return self.runChain('setup', state).then(function() {
				if (state.stage < SETUP) {
					state.stage = SETUP;
					self.stage(SETUP);
				}
			});
		});
	}).then(function() {
		self.queue = null;
	}).catch(function(err) {
		delete state.abort;
		if (err != "abort") console.error(err);
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
	var chain = this.chains[name];
	chain.promise = this.allFn(state, name, chain.thenables);
	return chain.promise.then(function() {
		this.emit("page" + name);
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

PageClass.prototype.waitUiReady = function(state) {
	if (document.visibilityState == "prerender") {
		var solve, p = new Promise(function(resolve) { solve = resolve; });
		function vizListener() {
			document.removeEventListener('visibilitychange', vizListener, false);
			solve();
		}
		document.addEventListener('visibilitychange', vizListener, false);
		return p.then(waitImports);
	} else {
		return waitImports();
	}
	function waitImports() {
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

			return new Promise(function(resolve, reject) {
				function loadListener() {
					link.removeEventListener('load', loadListener);
					resolve();
				}
				function errorListener() {
					link.removeEventListener('error', errorListener);
					resolve();
				}
				link.addEventListener('load', loadListener);
				link.addEventListener('error', errorListener);
			});
		})).then(function() {
			return state;
		});
	}
};

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
	return p;
};

PageClass.prototype.importDocument = function(doc) {
	var scripts = queryAll(doc, 'script').map(function(node) {
		if (node.type && node.type != "text/javascript") return Promise.resolve({});
		// make sure script is not loaded when inserted into document
		node.type = "text/plain";
		// fetch script content ourselves
		if (node.src) return pGet(node.src).then(function(txt) {
			return {
				src: node.src,
				txt: txt,
				node: node
			};
		}).catch(function(err) {
			console.error("Error loading", node.src, err);
			return {};
		});
		else return Promise.resolve({
			src: "inline", txt: node.textContent, node: node
		});
	});

	var imports = queryAll(doc, 'link[rel="import"]');
	var cursor;
	imports.forEach(function(link) {
		if (!cursor) {
			cursor = doc.createTextNode("");
			link.parentNode.insertBefore(cursor, link);
		}
		link.remove();
	});

	var root = document.documentElement;
	while (root.attributes.length > 0) {
		root.removeAttribute(root.attributes[0].name);
	}
	if (doc.attributes) for (var i=0; i < doc.attributes.length; i++) {
		root.setAttribute(doc.attributes[i].name, doc.attributes[i].value);
	}
	root.replaceChild(document.adoptNode(doc.head), document.head);
	root.replaceChild(document.adoptNode(doc.body), document.body);

	// execute all scripts in their original order as soon as they loaded
	var chain = Promise.resolve();
	scripts.forEach(function(prom) {
		chain = chain.then(function() {
			return prom;
		}).then(function(obj) {
			if (!obj.txt) return;
			var script = document.createElement("script");
			script.textContent = obj.txt;
			document.head.appendChild(script).remove();
			obj.node.type = "text/javascript";
		});
	});
	return chain.then(function() {
		imports.forEach(function(link) {
			cursor.parentNode.insertBefore(link, cursor);
		});
	});
};

PageClass.prototype.push = function(state) {
	return this.historyMethod('push', state);
};

PageClass.prototype.replace = function(state) {
	return this.historyMethod('replace', state);
};

PageClass.prototype.historyMethod = function(method, state) {
	var copy = this.parse(typeof state == "string" ? state : this.format(state));
	['document', 'data', 'stage'].forEach(function(k) {
		if (state[k]) copy[k] = state[k];
	});

	if (this.supportsHistory && !state.saved && method == "push") {
		// we want current location here
		var to = this.stateTo(this.state);
		// ensure it calls patch or build chain
		if (to.stage == BUILT) to.stage = SETUP;
		to.href = this.format(this.parse(document.location.toString()));
		this.window.history.replaceState(to, document.title, to.href);
	}

	return this.run(copy).then(function() {
		this.state = copy;
		var to = this.stateTo(copy);
		if (this.supportsHistory) {
			this.window.history[method + 'State'](to, document.title, to.href);
		}
	}.bind(this));
};

PageClass.prototype.stateTo = function(state) {
	state.saved = true;
	var to = {
		href: this.format(state),
		stage: state.initialStage
	};
	to.data = state.data;
	return to;
};

PageClass.prototype.stateFrom = function(from) {
	if (!from || !from.href) return;
	var state = this.parse(from.href);
	state.stage = from.stage;
	state.data = from.data || {};
	state.saved = true;
	return state;
};

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
