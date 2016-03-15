function WindowPage() {
	var inst = window.Page;
	if (inst) {
		// because using instanceof requires reference to the same WindowPage
		if (inst.name == "WindowPage") return inst;
	}
	this.name = "WindowPage";

	var QueryString = require('query-string');

	this.parse = function(str) {
		var obj = new URL(str, document.location);
		obj.query = QueryString.parse(obj.search);
		return obj;
	};
	this.format = function(obj) {
		var query = QueryString.stringify(obj.query);
		if (query) obj.search = query;
		else obj.search = null;
		if (obj.path) {
			var help = this.parse(obj.path);
			obj.pathname = help.pathname;
			obj.search = help.search;
			delete obj.path;
		}
		return obj.toString();
	};

	this.reset();
	this.stage(null);

	this.historyListener = this.historyListener.bind(this);
	window.addEventListener('popstate', this.historyListener);

	this.route = this.route.bind(this);
	this.build = this.build.bind(this);
	this.handle = this.handle.bind(this);

	this.runRoutes = this.runRoutes.bind(this);
	this.runBuilds = this.runBuilds.bind(this);
	this.runHandles = this.runHandles.bind(this);

	this.waitUiReady = this.waitUiReady.bind(this);

	this.waitReady().then(function() {
		var page = 	this.parse("");
		var stage = this.stage();
		page.stage = stage;
		if (stage == "route") {
			return this.runRoutes(page);
		} else if (stage == "route") {
			return this.runBuilds(page);
		} else if (stage == "build") {
			return Promise.resolve(page)
				.then(this.waitUiReady)
				.then(function() {
					return this.runHandles(page);
				}.bind(this));
		}
	}.bind(this));
}

WindowPage.prototype.runRoutes = function(page) {
	page.stage = "route";
	this.stage(page.stage);
	this.router = this.allFn(page, this.routes);
	return this.router.then(this.importDocument.bind(this)).then(this.runBuilds);
};

WindowPage.prototype.route = function(fn) {
	this.routes.push(fn);
	if (this.router && this.stage() == "route") {
		this.router = this.oneFn(this.router, fn);
	}
	return this;
};

WindowPage.prototype.runBuilds = function(page) {
	page.stage = "build";
	this.stage(page.stage);
	this.builder = this.allFn(page, this.builds);
	return this.builder
		.then(this.waitUiReady)
		.then(function() {
			return this.runHandles(page);
		}.bind(this));
};

WindowPage.prototype.build = function(fn) {
	this.builds.push(fn);
	if (this.builder && this.stage() == "build") {
		this.builder = this.oneFn(this.builder, fn);
	}
	return this;
};

WindowPage.prototype.runHandles = function(page) {
	page.stage = "handle"
	this.handler = this.allFn(page, this.handles);
	return this.handler;
};


WindowPage.prototype.handle = function(fn) {
	this.handles.push(fn);
	if (this.handler) {
		this.handler = this.oneFn(this.handler, fn);
	}
	return this;
};

WindowPage.prototype.catcher = function(phase, err, fn) {
	console.error("Uncaught error during", phase, err, fn);
};

WindowPage.prototype.oneFn = function(p, fn) {
	var catcher = this.catcher.bind(this);
	return p.then(function(page) {
		return Promise.resolve(page).then(fn).catch(function(err) {
			return catcher(page.stage, err, fn);
		}).then(function() {
			return page;
		});
	});
};

WindowPage.prototype.allFn = function(page, list) {
	var p = Promise.resolve(page);
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
	if (!name) name = "route";
	return name;
};

WindowPage.prototype.waitUiReady = function() {
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
		}));
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

WindowPage.prototype.reset = function() {
	this.router = null;
	this.builder = null;
	this.handler = null;
	this.routes = [];
	this.builds = [];
	this.handles = [];
};

WindowPage.prototype.importDocument = function(page) {
	var doc = page.document;
	if (!doc) doc = page.document = window.document;
	if (doc == window.document) return page;
	page.document = window.document;
	this.reset();
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
		return page;
	});
};

WindowPage.prototype.push = function(page) {
	this.historyMethod('push', page);
};

WindowPage.prototype.replace = function(page) {
	this.historyMethod('replace', page);
};

WindowPage.prototype.historyMethod = function(method, page) {
	return (
		page.document == window.document ? this.runBuilds(page) : this.runRoutes(page)
	).then(function() {
		method = method + 'State';
		if (!window.history || !window.history[method]) return;
		window.history[method](null, page.document.title, this.format(page));
	}.bind(this));
};

WindowPage.prototype.historyListener = function(e) {
	// happens on some browsers
//	if (document.location.href == this.format(this.page)) return;
	// TODO

};

window.Page = new WindowPage();

