function WindowPage(inst) {
	if (inst) {
		if (inst instanceof WindowPage) return inst;
		else if (inst.state) this.state = inst.state;
	}

	require('component-emitter')(this);
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

	this.waitBuild(function() {
		if (this.stage() == "build") {
			this.builder = Promise.resolve();
			this.waitHandle(this.handle.bind(this));
		} else {
			this.build();
		}
	}.bind(this));
}

WindowPage.prototype.build = function(fn) {
	var phase = "build";
	if (!fn) {
		this.stage(phase);
		this.builder = this.allFn(this.builds, phase);
		var visible = document.documentElement.offsetWidth || document.documentElement.offsetHeight;
		if (visible) {
			this.builder.then(function() {
				this.waitHandle(this.handle.bind(this));
			}.bind(this));
		}
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
	if (name) root.setAttribute("stage", name);
	else name = root.getAttribute("stage");
	return name;
};

WindowPage.prototype.waitHandle = function(cb) {
	Promise.all(Array.from(document.querySelectorAll('link[rel="import"]'))
	.map(function(link) {
		if (link.import) {
			var state = link.import.readyState;
			var isWebkit = window.navigator.userAgent.indexOf('AppleWebKit');
			if (state == "complete" || (state == "loading" && isWebkit && window.WebComponents)) {
				return Promise.resolve();
		}
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
};

WindowPage.prototype.waitBuild = function(cb) {
	if (document.readyState == "interactive" || document.readyState == "complete") {
		cb();
	} else {
		function listener() {
			document.removeEventListener('DOMContentLoaded', listener);
			cb();
		}
		document.addEventListener('DOMContentLoaded', listener);
	}
};

WindowPage.prototype.import = function(doc) {
	var scripts = Array.from(doc.querySelectorAll('script')).map(function(node) {
		if (node.type && node.type != "text/javascript") return Promise.resolve();
		// make sure script is not loaded when inserted into document
		node.type = "text/plain";
		// fetch script content ourselves
		if (node.src) return GET(node.src).then(function(txt) {
			return {src: node.src, txt: txt, node: node};
		}).catch(function(err) {
			console.error("Error loading", node.src, err);
		});
		else return Promise.resolve({
			src: "inline", txt: node.textContent, node: node
		});
	});

	var imports = Array.from(doc.querySelectorAll('link[rel="import"]'));
	imports.forEach(function(link) {
		link.rel = "";
	});

	var root = document.documentElement;
	if (doc.attributes) for (var i=0; i < doc.attributes.length; i++) {
		root.setAttribute(doc.attributes[i].name, doc.attributes[i].value);
	}
	root.replaceChild(document.adoptNode(doc.head), document.head);
	root.replaceChild(document.adoptNode(doc.body), document.body);

	// execute all scripts at once in their original order
	return Promise.all(scripts).then(function(list) {
		list.forEach(function(obj) {
			if (!obj.txt) return;
			var script = document.createElement("script");
			script.textContent = obj.txt;
			document.head.appendChild(script).remove();
			obj.node.type = "text/javascript";
		});
		imports.forEach(function(link) {
			var after = link.nextSibling;
			var parent = link.parentNode;
			link.remove();
			link.rel = "import";
			if (after) parent.insertBefore(link, after);
			else parent.appendChild(link);
		});
	});
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

window.Page = new WindowPage(window.Page);

