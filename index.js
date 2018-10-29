var QueryString = require('query-string');
var Diff = require('levenlistdiff');

var INIT = "init";
var ROUTE = "route";
var BUILD = "build";
var PATCH = "patch";
var SETUP = "setup";
var CLOSE = "close";

var Stages = [INIT, ROUTE, BUILD, PATCH, SETUP, CLOSE];

var urlHelper = document.createElement('a');

function PageClass() {
	this.name = "PageClass";
	this.window = window;
	this.debug = false;
	this.reset();

	Stages.forEach(function(stage) {
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

PageClass.prototype.trackListeners = function(node) {
	var list = this.listeners;
	var sources = this.sources || {};
	if (list) list.forEach(function(obj) {
		if (!obj.src || sources[obj.src]) return;
		debug("remove event listener", obj.evt, obj.src);
		obj.node.removeEventListener(obj.evt, obj.fn, obj.opts);
	}, this);
	list = this.listeners = [];
	var meth = node.addEventListener;
	if (meth == Node.prototype.addEventListener) node.addEventListener = function(evt, fn, opts) {
		var src = document.currentScript;
		if (src) src = src.src;
		list.push({node: node, evt: evt, fn: fn, opts: opts, src: src});
		return meth.call(node, evt, fn, opts);
	};
};

PageClass.prototype.stage = function(stage) {
	var root = this.root;
	if (!root) {
		this.root = root = document.querySelector('[data-page-stage]') || document.documentElement;
	}
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
		query: loc.query || QueryString.parse(loc.search),
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
	var e = new CustomEvent(name, {
		view: window,
		bubbles: true,
		cancelable: true,
		detail: state
	});
	e.state = state; // backward compat
	document.dispatchEvent(e);
};

PageClass.prototype.run = function(state) {
	var url = this.format(state); // converts path if any
	if (!state.data) state.data = {};
	var self = this;
	if (this.queue) {
		if (this.state && this.state.stage == BUILD) {
			this.state.abort = true;
		} else {
			return this.queue.then(function() {
				return self.run(state);
			});
		}
	}
	var curState;
	this.queue = this.waitReady().then(function() {
		// not sure state.stage must be set here
		debug("doc ready");
		state.initialStage = state.stage = self.stage();
		curState = self.state || self.parse();
		if (!self.sameDomain(curState, state)) {
			throw new Error("Cannot route to a different domain:\n" + url);
		}
		var refer = self.state || document.referrer;
		if (refer) self.referrer = self.parse(refer);
		else self.referrer = null;

		if (curState.pathname != state.pathname) {
			state.stage = INIT;
		}
		if (state.stage == INIT && curState.stage == SETUP) {
			self.stage(CLOSE);
			return self.runChain(CLOSE, curState);
		}
	}).then(function() {
		return self.runChain(INIT, state);
	}).then(function() {
		if (state.stage != INIT) return;
		self.stage(INIT);
		return Promise.resolve().then(function() {
			if (curState.pathname == state.pathname) return; // nothing to do
			if (self.chains.route.count > 0) return;
			return pGet(url, 500).then(function(client) {
				var doc = document.cloneNode(false);
				if (!doc.documentElement) doc.appendChild(doc.createElement('html'));
				doc.documentElement.innerHTML = client.responseText;
				if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
					throw new Error(client.statusText);
				}
				state.document = doc;
			});
		}).then(function() {
			return self.runChain(ROUTE, state);
		});
	}).then(function() {
		if (state.stage != ROUTE || !state.document) return;
		self.trackListeners(document);
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
		return self.runChain(BUILD, state).then(function() {
			return self.runChain(PATCH, state);
		}).then(function() {
			self.stage(BUILD);
		});
	}).then(function() {
		if (state.stage == SETUP) {
			// run patch if any, or build
			return self.runChain(self.chains.patch.count ? PATCH : BUILD, state);
		} else return self.waitUiReady().then(function() {
			if (state.abort) return Promise.reject("abort");
			return self.runChain(SETUP, state).then(function() {
				self.stage(SETUP);
			});
		});
	}).catch(function(err) {
		delete state.abort;
		if (err != "abort") {
			// eslint-disable-next-line no-console
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

PageClass.prototype.reload = function() {
	var state = this.state;
	this.state = {stage: state.stage};
	state.stage = state.initialStage;
	return this.run(state);
};

PageClass.prototype.reset = function() {
	this.chains = {};
	Stages.forEach(function(stage) {
		this.chains[stage] = {
			count: 0
		};
	}, this);
};

PageClass.prototype.runChain = function(name, state) {
	state.stage = name;
	var chain = this.chains[name];
	debug("run chain", name, "of length", chain.count);
	chain.promise = Promise.resolve();
	this.emit("page" + name, state);
	return chain.promise;
};

PageClass.prototype.stageListener = function(stage, fn, e) {
	var chain = this.chains[stage];
	var me = this;
	debug("run listener", stage, typeof fn);
	chain.promise = chain.promise.then(function() {
		return fn(e.detail);
	}).catch(function(err) {
		return me.catcher(stage, err, fn);
	});
};

PageClass.prototype.chain = function(stage, fn) {
	var ls = fn.pageListeners;
	if (!ls) ls = fn.pageListeners = {};
	var lfn = ls[stage];
	if (!lfn) {
		lfn = ls[stage] = this.stageListener.bind(this, stage, fn);
		this.chains[stage].count++;
		document.addEventListener('page' + stage, lfn);
	}
	var p = Promise.resolve();
	if (this.stage >= Stages.indexOf(stage) - 1) {
		debug("chain has run, execute fn now", stage);
		var state = this.state;
		p = p.then(function() {
			return fn(state);
		});
	} else {
		debug("chain pending", stage);
	}
	return p;
};

PageClass.prototype.unchain = function(stage, fn) {
	var ls = fn.pageListeners;
	if (!ls) return;
	var lfn = ls[stage];
	if (!lfn) return;
	this.chains[stage].count--;
	delete ls[stage];
	document.removeEventListener('page' + stage, lfn);
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
		p = Promise.resolve();
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
	return p.then(function() {
		return waitImports(document);
	});
};

PageClass.prototype.importDocument = function(doc, state) {
	if (!state) state = this.state;
	if (doc == document) {
		return Promise.resolve();
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
	var sources = this.sources = {};

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
		sources[src] = true;
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

	this.reset();

	var root = document.documentElement;
	var atts = nroot.attributes;
	for (var i=0; i < atts.length; i++) {
		root.setAttribute(atts[i].name, atts[i].value);
	}
	atts = Array.prototype.slice.call(root.attributes);
	for (var j=0; j < atts.length; j++) {
		if (!nroot.hasAttribute(atts[j].name)) nroot.removeAttribute(atts[j].name);
	}

	var parallels = waitStyles(head, document.head);
	var serials = queryAll(nroot, 'script[type="none"],link[rel="none"]');
	var me = this;

	return Promise.resolve().then(function() {
		me.updateHead(head, state);
		return parallels;
	}).then(function() {
		return Promise.resolve().then(function() {
			return me.updateBody(body, state);
		}).then(function(body) {
			if (body && body.nodeName == "BODY") {
				document.documentElement.replaceChild(body, document.body);
			}
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
	this.window.history[method + 'State'](to, document.title, to.href);
};

PageClass.prototype.historyListener = function(e) {
	var state = this.stateFrom(e.state);
	if (state) {
		this.run(state);
	} else {
		state = this.parse();
		if (this.samePath(this.state, state) && this.state.hash != state.hash) {
			this.emit("pagehash", state);
			this.state.hash = state.hash;
		}
	}
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
			return Promise.resolve();
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

function debug() {
	var inst = window.Page || window.parent.Page;
	// eslint-disable-next-line no-console
	if (!inst || inst.debug) console.info.apply(console, Array.prototype.slice.call(arguments));
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

