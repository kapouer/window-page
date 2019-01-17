exports.get = function(url, statusRejects, type) {
	if (!statusRejects) statusRejects = 400;
	return new Promise(function(resolve, reject) {
		var xhr = new XMLHttpRequest();
		xhr.open("GET", url, true);
		var aborted = false;
		xhr.onreadystatechange = function() {
			if (aborted) return;
			var rs = this.readyState;
			if (rs < 2) return;
			var code = this.status;
			if (code < 200 || code >= statusRejects) {
				aborted = true;
				this.abort();
				reject(code);
				return;
			}
			if (type) {
				var ctype = this.getResponseHeader("Content-Type") || "";
				if (!ctype.startsWith(type)) {
					aborted = true;
					this.abort();
					resolve(this);
					return;
				}
			}
			if (rs == 4) resolve(this);
		};
		xhr.send();
	});
};

exports.createDoc = function(str) {
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

