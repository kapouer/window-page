var QueryString = require('query-string');
var Diff = require('levenlistdiff');

var INIT = "init";
var ROUTE = "route";
var BUILD = "build";
var PATCH = "patch";
var SETUP = "setup";
var CLOSE = "close";
var ERROR = "error";
var HASH = "hash";

PageClass.Stages = [INIT, ROUTE, BUILD, PATCH, SETUP, HASH, ERROR, CLOSE];

var urlHelper = document.createElement('a');

function PageClass() {
	this.name = "PageClass";
	this.window = window;
	this.chains = {};

	this.reset();

	PageClass.Stages.forEach(function(stage) {
		this[stage] = this.chain.bind(this, stage);
		this['un' + stage] = this.unchain.bind(this, stage);
	}, this);


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

PageClass.prototype.stage = function(stage) {
	if (stage != null) this.root.setAttribute('data-page-stage', stage);
	else stage = this.root.dataset.pageStage;
	return stage || INIT;
};

PageClass.prototype.parse = function(str) {
	var dloc = this.window.document.location;
	var loc;
	if (str == null || typeof str == "string") {
		loc = urlHelper;
		loc.href = str || "";
	} else {
		loc = str;
	}
	var obj = {
		pathname: loc.pathname,
		query: loc.query || QueryString.parse(loc.search)
	};
	if (!obj.pathname) obj.pathname = "/";
	else if (obj.pathname[0] != "/") obj.pathname = "/" + obj.pathname;

	var hash = loc.hash || (str == null ? dloc.hash : null);
	if (hash && hash[0] == "#") hash = hash.substring(1);

	if (hash != null && hash != '') obj.hash = hash;

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
	if (typeof obj == "string") obj = this.parse(obj);
	else obj = Object.assign({}, obj);
	if (obj.path) {
		var parsedPath = this.parse(obj.path);
		obj.pathname = parsedPath.pathname;
		obj.query = parsedPath.query;
		obj.hash = parsedPath.hash;
		delete obj.path;
	}
	var qstr;
	if (obj.query) qstr = QueryString.stringify(obj.query);
	else if (obj.search) qstr = obj.search[0] == "?" ? obj.search.substring(1) : obj.search;
	obj.search = qstr;

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
	if (qstr) str += '?' + qstr;
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
	debug("emit", name);
	var e = new CustomEvent(name, {
		view: window,
		bubbles: true,
		cancelable: true,
		detail: state
	});
	e.state = state; // backward compat
	Array.from(document.querySelectorAll('script')).forEach(function(node) {
		node.dispatchEvent(e);
	});
	if (state.emitter) state.emitter.dispatchEvent(e);
};

PageClass.prototype.run = function(state) {
	var url = this.format(state); // converts path if any
	if (!state.data) state.data = {};
	var self = this;
	if (this.queue) {
		if (this.state && this.state.stage == BUILD) {
			debug("aborting current run");
			this.state.abort = true;
		} else {
			debug("queueing");
			return this.queue.then(function() {
				return self.run(state);
			});
		}
	}
	var refer = self.state || document.referrer;
	if (!self.state) {
		self.state = this.parse(state);
		delete self.state.hash;
	}
	refer = self.referrer = refer ? self.parse(refer) : self.state;
	this.queue = this.waitReady().then(function() {
		self.trackListeners(document.body);
		// not sure state.stage must be set here
		state.initialStage = state.stage = self.stage();
		debug("doc ready at stage", state.initialStage);

		if (!self.sameDomain(refer, state)) {
			throw new Error("Cannot route to a different domain:\n" + url);
		}

		if (refer.pathname != state.pathname) {
			state.stage = INIT;
		}
		if (state.stage == INIT) {
			if (refer.stage == SETUP) {
				self.stage(CLOSE);
				return self.runChain(CLOSE, refer);
			}
		}
	}).then(function() {
		var prevStage = state.stage;
		return (self.runChain(INIT, state) || P()).then(function() {
			state.stage = prevStage;
		});
	}).then(function() {
		if (state.stage != INIT) return;
		self.stage(INIT);
		if (state.initialStage !== INIT && self.state.pathname == state.pathname) {
			debug("refer has same pathname", state.pathname);
			return;
		}
		var routed = self.runChain(ROUTE, state);
		if (!routed && state.initialStage !== INIT) return pGet(url, 500).then(function(client) {
			var doc = self.createDoc(client.responseText);
			if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
				throw new Error(client.statusText);
			} else if (!doc) {
				setTimeout(function() {
					document.location = url;
				}, 500);
				throw new Error("Cannot load remote document - redirecting...");
			}
			state.document = doc;
		});
		return routed;
	}).then(function() {
		var prev = self.state;
		state.emitter = prev.emitter;
		self.state = state;
		if (state.stage != ROUTE) return;
		if (prev.stage) delete state.emitter;
		self.clearListeners(document.body);
		if (!state.document) return;
		return self.importDocument(state.document, state).then(function() {
			delete state.document;
			var docStage = self.stage();
			debug("imported doc at stage", docStage);
			if (docStage == INIT) {
				docStage = ROUTE;
				self.stage(ROUTE);
			}
			state.stage = docStage;
		});
	}).then(function() {
		if (state.stage != INIT && state.stage != ROUTE) return;
		return (self.runChain(BUILD, state) || P()).then(function() {
			return self.runChain(PATCH, state);
		}).then(function() {
			self.stage(BUILD);
		});
	}).then(function() {
		if (state.stage == SETUP) {
			if (!self.samePath(state, refer)) {
				return self.runChain(PATCH, state) || self.runChain(BUILD, state);
			}
		} else return self.waitUiReady().then(function() {
			if (state.abort) return Promise.reject("abort");
			return (self.runChain(SETUP, state) || P()).then(function() {
				self.stage(SETUP);
			});
		});
	}).then(function() {
		if (state.hash != refer.hash) return self.runChain(HASH, state);
	}).catch(function(err) {
		delete state.abort;
		if (err != "abort") {
			// eslint-disable-next-line no-console
			if (typeof err != "number") console.error(err);
			state.error = err;
			self.runChain(ERROR, state)
		}
	}).then(function() {
		self.queue = null;
	});
	return this.queue;
};

PageClass.prototype.reload = function() {
	var state = this.state;
	this.state = {stage: state.stage};
	state.stage = state.initialStage;
	return this.run(state);
};

PageClass.prototype.clearListeners = function(node) {
	(this.listeners || []).forEach(function(obj) {
		node.removeEventListener(obj.name, obj.fn, obj.opts);
	});
	this.listeners = [];
};

PageClass.prototype.trackListeners = function(node) {
	var self = this;
	if (!node) {
		// eslint-disable-next-line no-console
		console.warn("No node to track listeners");
		return;
	}
	if (node.addEventListener == Node.prototype.addEventListener) {
		this.listeners = [];
		node.addEventListener = function(name, fn, opts) {
			debug("track listener", name);
			self.listeners.push({
				name: name,
				fn: fn,
				opts: opts
			});
			return Node.prototype.addEventListener.call(this, name, fn, opts);
		};
	}
};

PageClass.prototype.reset = function() {
	var root = this.root;
	if (!root) {
		this.root = root = document.querySelector('[data-page-stage]') || document.documentElement;
	}
};

PageClass.prototype.runChain = function(name, state) {
	state.stage = name;
	var chain = this.chains[name];
	if (!chain) {
		debug("no chain", name);
		return;
	}
	debug("run chain", name);
	chain.count = 0;
	chain.promise = P();
	this.emit("page" + name, state);
	debug("run chain count", name, chain.count);
	if (chain.count) return chain.promise;
};

PageClass.prototype.stageListener = function(stage, fn, e) {
	var chain = this.chains[stage];
	if (!chain) chain = this.chains[stage] = {};
	if (chain.count == null) chain.count = 0;
	chain.count++;
	chain.promise = chain.promise.then(function() {
		return fn(e.detail);
	}).catch(function(err) {
		return this.catcher(stage, err, fn);
	}.bind(this));
};

PageClass.prototype.chain = function(stage, fn) {
	var ls = fn.pageListeners;
	if (!ls) ls = fn.pageListeners = {};
	var lfn = ls[stage];
	var emitter = document.currentScript;
	if (!emitter) {
		emitter = this.state.emitter;
		if (!emitter) emitter = this.state.emitter = urlHelper.cloneNode();
	}

	if (!lfn) {
		lfn = ls[stage] = {
			fn: this.stageListener.bind(this, stage, fn),
			em: emitter
		};
		emitter.addEventListener('page' + stage, lfn.fn);
	}
	var p;
	var curNum = PageClass.Stages.indexOf(this.state.stage || INIT);
	var tryNum = PageClass.Stages.indexOf(stage);
	if (tryNum <= curNum) {
		debug("chain has run, execute fn now", stage);
		var state = this.state;
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

PageClass.prototype.unchain = function(stage, fn) {
	var ls = fn.pageListeners;
	if (!ls) return;
	var lfn = ls[stage];
	if (!lfn) return;
	delete ls[stage];
	lfn.em.removeEventListener('page' + stage, lfn.fn);
};

PageClass.prototype.catcher = function(name, err, fn) {
	// eslint-disable-next-line no-console
	console.error("Uncaught error during", name, err, fn);
};

PageClass.prototype.waitUiReady = function() {
	var solve;
	if (document.visibilityState == "prerender") {
		var p = new Promise(function(resolve) {
			solve = resolve;
		});
		document.addEventListener('visibilitychange', listener, false);
	} else {
		p = P();
	}
	return p.then(function() {
		return waitStyles(document.head);
	});

	function listener() {
		document.removeEventListener('visibilitychange', listener, false);
		solve();
	}
};

PageClass.prototype.waitReady = function() {
	if (this.docReady) return P();
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
	return p.then(function() {
		return waitImports(document);
	});
};

PageClass.prototype.importDocument = function(doc, state) {
	if (!state) state = this.state;
	if (doc == document) {
		debug("Do not import same document");
		return P();
	}
	debug("Import new document");
	var states = {};
	var selector = 'script:not([type]),script[type="text/javascript"],link[rel="import"]';
	queryAll(document, selector).forEach(function(node) {
		var src = node.src || node.href;
		if (src) states[src] = true;
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
			node.setAttribute('rel', 'none');
			if (!node.import) return; // polyfill already do preloading
		}
		var src = node.src || node.href;
		if (!src) return;
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

	this.reset();
	this.trackListeners(body);

	var atts = nroot.attributes;
	for (var i=0; i < atts.length; i++) {
		this.root.setAttribute(atts[i].name, atts[i].value);
	}
	atts = Array.prototype.slice.call(this.root.attributes);
	for (var j=0; j < atts.length; j++) {
		if (!nroot.hasAttribute(atts[j].name)) nroot.removeAttribute(atts[j].name);
	}

	var parallels = waitStyles(head, document.head);
	var serials = queryAll(nroot, 'script[type="none"],link[rel="none"]');
	var me = this;

	return P().then(function() {
		me.updateHead(head, state);
		return parallels;
	}).then(function() {
		return P().then(function() {
			return me.updateBody(body, state);
		}).then(function(body) {
			if (body && body.nodeName == "BODY") {
				document.body.parentNode.replaceChild(body, document.body);
			}
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

PageClass.prototype.updateHead = function(head) {
	this.updateAttributes(document.head, head);
	this.updateChildren(document.head, head);
};

PageClass.prototype.updateBody = function(body) {
	return body;
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
		// eslint-disable-next-line no-console
		if (method == "replace") console.info("Cannot replace to a different origin");
		debug("redirecting to", url);
		document.location = url;
		return P();
	}
	debug("run", method, state);
	return this.run(copy).then(function() {
		this.historySave(method, copy);
	}.bind(this));
};

PageClass.prototype.historySave = function(method, state) {
	if (!this.supportsHistory) return;
	var to = this.stateTo(state);
	this.window.history[method + 'State'](to, document.title, to.href);
};

PageClass.prototype.historyListener = function(e) {
	var state = this.stateFrom(e.state) || this.parse();
	debug("history event", e.type, state);
	this.run(state);
};

PageClass.prototype.stateTo = function(state) {
	return {
		href: this.format(state),
		data: state.data
	};
};

PageClass.prototype.stateFrom = function(from) {
	if (!from || !from.href) return;
	var state = this.parse(from.href);
	state.stage = SETUP;
	state.data = from.data || {};
	return state;
};

function waitStyles(head, old) {
	var knowns = {};
	var thenFn;
	var sel = 'link[rel="stylesheet"]';
	if (old && head != old) {
		queryAll(old, sel).forEach(function(node) {
			knowns[node.href] = true;
		}, this);
		thenFn = readyNode;
	} else {
		thenFn = readyStyle;
	}
	return Promise.all(
		queryAll(head, sel).filter(function(node) {
			return !knowns[node.href];
		}).map(thenFn)
	);
}

function waitImports(doc) {
	var imports = queryAll(doc, 'link[rel="import"]');
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
			return P();
		}
		if (polyfill) {
			// link.onload cannot be trusted
			return whenReady();
		}

		return readyNode(link);
	}));
}

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

function readyStyle(link) {
	var done = false;
	return new Promise(function(resolve) {
		readyNode(link).then(function() {
			if (!done) {
				done = true;
				resolve();
			}
		});
		(function check() {
			if (done) return;
			var ok = false;
			try {
				ok = link.sheet && link.sheet.cssRules;
			} catch(ex) {
				// bail out
				ok = true;
			}
			if (ok) {
				done = true;
				resolve();
			}	else {
				setTimeout(check, 5);
			}
		})();
	});
}

function readyNode(node) {
	return new Promise(function(resolve) {
		function done() {
			node.removeEventListener('load', done);
			node.removeEventListener('error', done);
			resolve();
		}
		node.addEventListener('load', done);
		node.addEventListener('error', done);
	});
}

var debugOn = null;
var debug = (function() {
	if (window.debug) return window.debug;
	if (debugOn === null) {
		debugOn = false;
		if (window.localStorage) {
			var str = window.localStorage.getItem('debug');
			if (str !== null) debugOn = (str || '').toLowerCase().split(' ').indexOf('window-page') >= 0;
		}
	}
	if (!debugOn) {
		return function() {};
	} else {
		// eslint-disable-next-line no-console
		return console.info.bind(console);
	}
})();

function P() {
	return Promise.resolve();
}

PageClass.prototype.createDoc = function(str) {
	var doc;
	try {
		doc = (new window.DOMParser()).parseFromString(str, "text/html");
	} catch(ex) {
		try {
			doc = document.cloneNode(false);
			doc.open();
			doc.write(str);
			doc.close();
		} catch(ex) { /* pass */ }
	}
	if (doc && !doc.documentElement && doc.children.length == 1) {
		// firefox
		try {
			doc.documentElement = doc.firstElementChild;
		} catch(ex) {
			// eslint-disable-next-line no-console
			console.error(ex);
		}
	}
	return doc;
};

PageClass.init = function() {
	var inst = window.Page;
	if (inst) {
		if (inst.name != "PageClass") throw new Error("window.Page already exists");
	} else {
		window.Page = new PageClass();
	}
};

PageClass.init();

