exports.get = function(url, statusRejects) {
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
};

exports.parseDoc = function(str) {
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

var debugFn;
var debugOn = null;
exports.debug = (function() {
	if (debugFn) return debugFn;
	if (window.debug) {
		debugFn = window.debug;
	} else {
		if (debugOn === null) {
			debugOn = false;
			if (window.localStorage) {
				var str = window.localStorage.getItem('debug');
				if (str !== null) debugOn = (str || '').toLowerCase().split(' ').indexOf('window-page') >= 0;
			}
		}
		if (!debugOn) {
			debugFn = function() {};
		} else {
			// eslint-disable-next-line no-console
			debugFn = console.info.bind(console);
		}
	}
	return debugFn;
})();

exports.P = function() {
	return Promise.resolve();
};

exports.all = function(node, selector) {
	if (node.queryAll) return node.queryAll(selector);
	var list = node.querySelectorAll(selector);
	if (Array.from) return Array.from(list);
	return Array.prototype.slice.call(list);
};

var trackedListeners;
exports.clearListeners = function(node) {
	(trackedListeners || []).forEach(function(obj) {
		node.removeEventListener(obj.name, obj.fn, obj.opts);
	});
	trackedListeners = [];
};

exports.trackListeners = function(node) {
	if (!node) {
		// eslint-disable-next-line no-console
		console.warn("No node to track listeners");
		return;
	}
	if (node.addEventListener == Node.prototype.addEventListener) {
		trackedListeners = [];
		node.addEventListener = function(name, fn, opts) {
			trackedListeners.push({
				name: name,
				fn: fn,
				opts: opts
			});
			return Node.prototype.addEventListener.call(this, name, fn, opts);
		};
	}
};

