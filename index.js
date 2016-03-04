function WindowPage() {
	var inst = window.Page;
	if (inst) {
		// because using instanceof requires reference to the same WindowPage
		if (inst.name == "WindowPage") return inst;
		else if (inst.state) this.state = inst.state;
	}
	this.name = "WindowPage";

	var QueryString = require('query-string');

	this.location = new URL("", document.location);

	this.parse = function(str) {
		if (!str) str = document.location.search;
		return QueryString.parse(str);
	};
	this.stringify = function(obj) {
		return QueryString.stringify(obj);
	};

	this.builds = [];
	this.handles = [];

	this.historyListener = this.historyListener.bind(this);
	window.addEventListener('popstate', this.historyListener);

	this.import = this.import.bind(this);
	this.build = this.build.bind(this);

	this.waitBuild(function() {
		if (this.stage() == "build") {
			this.waitHandle(this.handle.bind(this));
		} else {
			this.build();
		}
	}.bind(this));
}

require('component-emitter')(WindowPage.prototype);

WindowPage.prototype.build = function(fn) {
	var phase = "build";
	if (!fn) {
		this.stage(phase);
		this.builder = this.allFn(this.builds, phase);
		this.waitHandle(this.handle.bind(this));
	} else {
		this.builds.push(fn);
		if (this.builder) this.builder = this.oneFn(this.builder, fn, phase);
	}
	return this;
};


WindowPage.prototype.handle = function(fn) {
	var phase = "handle";
	if (!fn) {
		this.handler = this.allFn(this.handles, phase);
	} else {
		this.handles.push(fn);
		if (this.handler) this.handler = this.oneFn(this.handler, fn, phase);
	}
	return this;
};

WindowPage.prototype.catcher = function(phase, err) {
	if (this.listeners('error').length) {
		this.emit('error', err, phase);
	} else {
		console.error("Uncaught error during", phase, err);
	}
};

WindowPage.prototype.oneFn = function(p, fn, phase) {
	return p.then(fn).catch(this.catcher.bind(this, phase));
};

WindowPage.prototype.allFn = function(list, phase) {
	var p = Promise.resolve();
	var self = this;
	list.forEach(function(fn) {
		p = self.oneFn(p, fn, phase);
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

WindowPage.prototype.waitHandle = function(cb) {
	var before = this.builder || Promise.resolve();
	before.then(function() {
		var p = Promise.resolve();
		if (document.visibilityState == "prerender") {
			function vizListener() {
				document.removeEventListener('visibilityChange', vizListener, false);
				p.then(waitImports);
			}
			document.addEventListener('visibilityChange', vizListener, false);
		} else {
			p.then(waitImports);
		}
	});
	function waitImports() {
		var imports = Array.from(document.querySelectorAll('link[rel="import"]'));
		var polyfill = window.HTMLImports;
		var whenReady;

		return Promise.all(imports.map(function(link) {
			if (link.import && link.import.readyState == "complete") {
				// no need to wait, wether native or polyfill
				return Promise.resolve();
			}
			if (polyfill) {
				// link.onload cannot be trusted
				return importsReady();
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
			cb();
		});
	}

	function importsReady() {
		if (!whenReady) whenReady = new Promise(function(resolve) {
			polyfill.whenReady(function() {
				resolve();
			});
		});
		return whenReady;
	}
};

WindowPage.prototype.waitBuild = function(cb) {
	if (this.docReady) return cb();
	// https://github.com/jquery/jquery/issues/2100
	if (document.readyState == "complete" ||
		(document.readyState != "loading" && !document.documentElement.doScroll)) {
		this.docReady = true;
		return setTimeout(cb);
	}
	var self = this;
	function listener() {
		document.removeEventListener('DOMContentLoaded', listener);
		window.removeEventListener('load', listener);
		if (self.docReady) return;
		self.docReady = true;
		cb();
	}
	document.addEventListener('DOMContentLoaded', listener);
	window.addEventListener('load', listener);
};

WindowPage.prototype.reset = function() {
	this.builder = null;
	this.handler = null;
	this.builds = [];
	this.handles = [];
	this.stage(null);
};

WindowPage.prototype.import = function(doc) {
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
	}).then(this.build);
};

/*
 * types of browse events (if they were all caught, which they will at some point):
 * same href, changing hash, changing query, changing path, changing domain
 * in case of same href, it is ignored
 * changing hash or query should trigger a query event
 * changing path should trigger a destroy/creation phase
 * changing domain should allow dialog, target blank
 */
WindowPage.prototype.historyListener = function(e) {
	// would not make sense but happens on some browsers
	var nloc = new URL("", document.location);
	var tloc = this.location;
	if (nloc.href == tloc.href) return;
	this.location = nloc;
	if (nloc.host == tloc.host && nloc.pathname == tloc.pathname && nloc.search != tloc.search) {
		this.emit('query', this.parse(nloc.search));
	}
};

/*
 * useless for now, will be called when changing path in location is handled
 */
WindowPage.prototype.destroy = function() {
	window.removeEventListener('popstate', this.historyListener);
	this.off();
};

window.Page = new WindowPage();

