var Utils = require('./utils');
var P = Utils.P;

var domReady = false;
exports.dom = function() {
	if (domReady) return P();
	var solve;
	var p = new Promise(function(resolve) {
		solve = resolve;
	});
	if (document.readyState == "complete") {
		domReady = true;
		setTimeout(solve);
		return p;
	}

	function readyLsn() {
		document.removeEventListener('DOMContentLoaded', readyLsn);
		window.removeEventListener('load', readyLsn);
		if (domReady) return;
		domReady = true;
		solve();
	}
	document.addEventListener('DOMContentLoaded', readyLsn);
	window.addEventListener('load', readyLsn);

	return p.then(function() {
		return exports.imports(document);
	});
};

exports.ui = function(val) {
	var solve;
	if (document.hidden) {
		var p = new Promise(function(resolve) {
			solve = resolve;
		});
		document.addEventListener('visibilitychange', listener, false);
	} else {
		p = P();
	}
	var sp = p.then(function() {
		return exports.styles(document.head);
	}).then(function() {
		return sp.fn(val);
	});
	return sp;

	function listener() {
		document.removeEventListener('visibilitychange', listener, false);
		solve();
	}
};

exports.styles = function(head, old) {
	var knowns = {};
	var thenFn;
	var sel = 'link[rel="stylesheet"]';
	if (old && head != old) {
		Utils.all(old, sel).forEach(function(node) {
			knowns[node.href] = true;
		}, this);
		thenFn = exports.node;
	} else {
		thenFn = exports.sheet;
	}
	return Promise.all(
		Utils.all(head, sel).filter(function(node) {
			return !knowns[node.href];
		}).map(thenFn)
	);
};

exports.imports = function(doc) {
	var imports = Utils.all(doc, 'link[rel="import"]');
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

		return exports.node(link);
	}));
};

exports.sheet = function(link) {
	var ok = false;
	try {
		ok = link.sheet && link.sheet.cssRules;
	} catch(ex) {
		// bail out
		ok = true;
	}
	if (ok) return Promise.resolve();
	var nlink = link.cloneNode();
	nlink.media = "print";
	var p = exports.node(nlink);
	var parent = link.parentNode;
	parent.insertBefore(nlink, link.nextSibling);
	return p.then(function() {
		parent.removeChild(nlink);
	});
};

exports.node = function(node) {
	return new Promise(function(resolve) {
		function done() {
			node.removeEventListener('load', done);
			node.removeEventListener('error', done);
			resolve();
		}
		node.addEventListener('load', done);
		node.addEventListener('error', done);
	});
};
