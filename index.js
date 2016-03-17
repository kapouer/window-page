function WindowPage() {
	var inst = window.Page;
	if (inst) {
		// because using instanceof requires reference to the same WindowPage
		if (inst.name == "WindowPage") return inst;
	}
	this.name = "WindowPage";

	var QueryString = require('query-string');

	this.parse = function(str) {
		var obj = new URL(str || "", document.location.toString());
		obj.query = QueryString.parse(obj.search);
		return obj;
	}.bind(this);
	this.format = function(obj) {
		var query = QueryString.stringify(obj.query);
		if (query) obj.search = query;
		else delete obj.search;
		if (obj.path) {
			var help = this.parse(obj.path);
			obj.pathname = help.pathname;
			obj.search = help.search;
			delete obj.path;
		}
		return obj.toString();
	};

	this.reset();

	this.historyListener = this.historyListener.bind(this);
	window.addEventListener('popstate', this.historyListener);

	this.route = this.chainThenable.bind(this, "route");
	this.build = this.chainThenable.bind(this, "build");
	this.handle = this.chainThenable.bind(this, "handle");

	this.importDocument = this.importDocument.bind(this);

	this.waitUiReady = this.waitUiReady.bind(this);

	var page = 	this.parse("");
	page.stage = this.stage();
	if (page.stage == "build") page.imported = true;
	this.run(page);
}

WindowPage.prototype.run = function(page) {
	var pageUrl = this.format(page);
	var self = this;
	return this.waitReady().then(function() {
		if (!page.imported) {
			return self.runChain('route', page);
		}
	}).then(function() {
		if (!page.imported && page.document) {
			self.reset();
			page.updating = false;
			return self.importDocument(page.document).then(function() {
				page.imported = true;
			});
		}
	}).then(function() {
		if (page.stage != "build") {
			// always run except if the document has just been opened in a build stage
			return self.runChain('build', page);
		}
	}).then(function() {
		return self.waitUiReady(page).then(function() {
			return self.runChain('handle', page);
		});
	}).then(function() {
		self.url = self.format(page);
		page.updating = true;
	});
};

WindowPage.prototype.reset = function() {
	this.chains = {
		route: {thenables: []},
		build: {thenables: []},
		handle: {thenables: []}
	};
};

WindowPage.prototype.runChain = function(stage, page) {
	page.stage = stage;
	this.stage(stage);
	var chain = this.chains[stage];
	chain.promise = this.allFn(page, chain.thenables);
	return chain.promise.then(function() {
		return page;
	});
};

WindowPage.prototype.chainThenable = function(stage, fn) {
	var chain = this.chains[stage];
	chain.thenables.push(fn);
	if (chain.promise && this.stage() == stage) {
		chain.promise = this.oneFn(chain.promise, fn);
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
	return name;
};

WindowPage.prototype.waitUiReady = function(page) {
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
			return page;
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

WindowPage.prototype.push = function(page) {
	return this.historyMethod('push', page);
};

WindowPage.prototype.replace = function(page) {
	return this.historyMethod('replace', page);
};

WindowPage.prototype.historyMethod = function(method, page) {
	return this.run(page).then(function() {
		method = method + 'State';
		if (!window.history || !window.history[method]) return;
		var state = {
			html: page.document && page.document.documentElement.outerHTML,
			data: page.data,
			href: page.href
		};
		window.history[method](state, document.title, this.format(page));
	}.bind(this));
};

WindowPage.prototype.historyListener = function(e) {
	var state = e.state;
	if (!state || !state.href) return;
	var page = this.parse(state.href);
	if (state.data) page.data = state.data;
	if (state.html) {
		var doc = document.implementation.createHTMLDocument("");
		doc.open();
		doc.write(state.html);
		doc.close();
		page.document = doc;
	} else {
		page.imported = true;
		page.updating = true;
	}
	this.run(page);
};

window.Page = new WindowPage();

