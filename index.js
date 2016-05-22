(function() {
var QueryString = require('query-string');

var INIT = 0;
var IMPORTED = 1;
var BUILT = 2;
var SETUP = 3;

function PageClass() {
	this.name = "PageClass";
	this.attribute = 'data-page-stage';
	this.window = window;

	this.reset();

	this.route = this.chainThenable.bind(this, "route");
	this.build = this.chainThenable.bind(this, "build");
	this.setup = this.chainThenable.bind(this, "setup");
	this.format = this.format.bind(this);

	if (this.window.history && !this.historyListener) {
		this.supportsHistory = true;
		this.historyListener = function(e) {
			var state = this.stateFrom(e.state);
			if (!state) return;
			this.run(state);
		}.bind(this);
		this.window.addEventListener('popstate', this.historyListener);
	}

	var state = this.parse();
	this.run(state);
}

PageClass.prototype.stage = function(stage) {
	var root = document.querySelector('['+this.attribute+']');
	if (!root) {
		root = document.documentElement;
	}
	this.root = root;
	if (stage === undefined) return parseInt(root.getAttribute(this.attribute)) || INIT;
	else root.setAttribute(this.attribute, stage);
	return stage;
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
		// run only once if setup was never run
		if (state.stage == BUILT) return;
		return self.runChain('build', state).then(function() {
			if (state.stage < BUILT) {
				state.stage = BUILT;
				self.stage(BUILT);
			}
		});
	}).then(function() {
		if (state.stage >= SETUP) return;
		return self.waitUiReady(state).then(function() {
			if (state.abort) return Promise.reject("abort");
			return self.runChain('setup', state).then(function() {
				if (state.stage < SETUP) {
					state.stage = SETUP;
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
		setup: {thenables: []}
	};
};

PageClass.prototype.runChain = function(name, state) {
	this.emit(name);
	var chain = this.chains[name];
	chain.promise = this.allFn(state, name, chain.thenables);
	return chain.promise.then(function() {
		return state;
	});
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
		if (node.src) return GET(node.src).then(function(txt) {
			return {src: node.src, txt: txt, node: node};
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
	return scripts.reduce(function(sequence, scriptPromise) {
		return sequence.then(function() {
			return scriptPromise;
		}).then(function(obj) {
			if (!obj.txt) return;
			var script = document.createElement("script");
			script.textContent = obj.txt;
			document.head.appendChild(script).remove();
			obj.node.type = "text/javascript";
		});
	}, Promise.resolve()).then(function() {
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
		// some kind of workaround
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
	if (state.data) to.data = state.data;
	return to;
};

PageClass.prototype.stateFrom = function(from) {
	if (!from || !from.href) return;
	var state = this.parse(from.href);
	state.stage = from.stage;
	if (from.data) state.data = from.data;
	state.saved = true;
	return state;
};

function queryAll(doc, selector) {
	if (doc.queryAll) return doc.queryAll(selector);
	var list = doc.querySelectorAll(selector);
	if (Array.from) return Array.from(list);
	return Array.prototype.slice.call(list);
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
