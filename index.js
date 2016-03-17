function WindowPage() {
	var inst = window.Page;
	if (inst) {
		// because using instanceof requires reference to the same WindowPage
		if (inst.name == "WindowPage") return inst;
	}
	this.name = "WindowPage";

	var QueryString = require('query-string');

	this.parse = function(str) {
		var dloc = this.window.document.location;
		var loc = new URL(str || "", dloc.toString());
		var obj = {
			pathname: loc.pathname,
			query: QueryString.parse(loc.search),
			hash: loc.hash
		};
		if (obj.hash && obj.hash[0] == "#") obj.hash = obj.hash.substring(1);
		if (loc.port != dloc.port || loc.hostname != dloc.hostname || loc.protocol != dloc.protocol) {
			obj.port = loc.port;
			obj.hostname = loc.hostname;
			obj.protocol = loc.protocol;
		}
		return obj;
	}.bind(this);

	this.format = function(obj) {
		var dloc = this.window.document.location;
		if (obj.path) {
			var parsedPath = this.parse(obj.path);
			obj.pathname = parsedPath.pathname;
			obj.query = parsedPath.query;
			obj.hash = parsedPath.hash;
			delete obj.path;
		}
		if (obj.protocol || obj.hostname || obj.port) {
			var loc = new URL("", dloc.toString());
			// copy only enumerable properties of a URL instance
			for (var k in loc) if (obj[k] !== undefined) loc[k] = obj[k];
			return loc.toString();
		}
		var str = obj.pathname || "";
		var qs = QueryString.stringify(obj.query || {});
		if (qs) str += '?' + qs;
		if (obj.hash) str += '#' + obj.hash;
		return str;
	}.bind(this);

	this.reset();

	this.route = this.chainThenable.bind(this, "route");
	this.build = this.chainThenable.bind(this, "build");
	this.handle = this.chainThenable.bind(this, "handle");

	this.importDocument = this.importDocument.bind(this);

	this.waitUiReady = this.waitUiReady.bind(this);

	var state = this.parse();
	state.stage = this.stage();
	if (state.stage == "build") state.imported = true;
	this.run(state);
}

WindowPage.prototype.run = function(state) {
	this.format(state); // converts path if any
	var self = this;
	return this.waitReady().then(function() {
		if (!state.imported) {
			return self.runChain('route', state);
		}
	}).then(function() {
		if (!state.imported && state.document) {
			self.reset();
			state.updating = false;
			return self.importDocument(state.document).then(function() {
				state.imported = true;
			});
		}
	}).then(function() {
		self.state = state;
		if (state.stage != "build") {
			// always run except if the document has just been opened in a build stage
			return self.runChain('build', state);
		}
	}).then(function() {
		return self.waitUiReady(state).then(function() {
			return self.runChain('handle', state);
		});
	}).then(function() {
		state.updating = true;
	});
};

WindowPage.prototype.reset = function() {
	this.chains = {
		route: {thenables: []},
		build: {thenables: []},
		handle: {thenables: []}
	};
};

WindowPage.prototype.runChain = function(name, state) {
	state.stage = name;
	this.stage(name);
	var chain = this.chains[name];
	chain.promise = this.allFn(state, chain.thenables);
	return chain.promise.then(function() {
		return state;
	});
};

WindowPage.prototype.chainThenable = function(name, fn) {
	var chain = this.chains[name];
	chain.thenables.push(fn);
	if (chain.promise && this.stage() == name) {
		chain.promise = this.oneFn(chain.promise, fn);
	}
	return this;
};

WindowPage.prototype.catcher = function(name, err, fn) {
	console.error("Uncaught error during", name, err, fn);
};

WindowPage.prototype.oneFn = function(p, fn) {
	var catcher = this.catcher.bind(this);
	return p.then(function(state) {
		return Promise.resolve(state).then(fn).catch(function(err) {
			return catcher(state.stage, err, fn);
		}).then(function() {
			return state;
		});
	});
};

WindowPage.prototype.allFn = function(state, list) {
	var p = Promise.resolve(state);
	var self = this;
	list.forEach(function(fn) {
		p = self.oneFn(p, fn);
	});
	return p;
};

WindowPage.prototype.stage = function(name) {
	var root = document.documentElement;
	if (name === null) root.removeAttribute("stage");
	else if (name) root.setAttribute("stage", name);
	else name = root.getAttribute("stage");
	return name;
};

WindowPage.prototype.waitUiReady = function(state) {
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
		var imports = Array.from(document.querySelectorAll('link[rel="import"]'));
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

WindowPage.prototype.waitReady = function() {
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

WindowPage.prototype.importDocument = function(doc) {
	var scripts = Array.from(doc.querySelectorAll('script')).map(function(node) {
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

	var imports = Array.from(doc.querySelectorAll('link[rel="import"]'));
	var cursor;
	imports.forEach(function(link) {
		if (!cursor) {
			cursor = doc.createTextNode("");
			link.parentNode.insertBefore(cursor, link);
		}
		link.remove();
	});

	var root = document.documentElement;
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

WindowPage.prototype.push = function(state) {
	return this.historyMethod('push', state);
};

WindowPage.prototype.replace = function(state) {
	return this.historyMethod('replace', state);
};

WindowPage.prototype.historyMethod = function(method, state) {
	if (typeof state == "string") state = this.parse(state);
	var supported = !!this.window.history;
	if (supported && !this.historyListener) {
		this.historyListener = function(e) {
			var state = this.stateFrom(e.state);
			if (!state) return;
			this.run(state);
		}.bind(this);
		this.window.addEventListener('popstate', this.historyListener);
		if (method == "push") {
			var to = this.stateTo(this.state);
			this.window.history.replaceState(to, document.title, to.href);
		}
	}
	return this.run(state).then(function() {
		this.state = state;
		var to = this.stateTo(state);
		if (supported) {
			this.window.history[method + 'State'](to, document.title, to.href);
		}
	}.bind(this));
};

WindowPage.prototype.stateTo = function(state) {
	var to = {
		href: this.format(state)
	};
	if (state.document) to.html = state.document.documentElement.outerHTML;
	if (state.data) to.data = state.data;
	return to;
};

WindowPage.prototype.stateFrom = function(from) {
	if (!from || !from.href) return;
	var state = this.parse(from.href);
	if (from.data) state.data = from.data;
	if (from.html) {
		var doc = document.implementation.createHTMLDocument("");
		doc.open();
		doc.write(from.html);
		doc.close();
		state.document = doc;
	} else {
		state.imported = true;
		state.updating = true;
	}
	return state;
};

window.Page = new WindowPage();

