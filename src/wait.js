import * as Utils from './utils';

const P = Utils.P;

let domReady = false;
export function dom() {
	if (domReady) return P();
	const d = new Utils.Deferred();
	if (document.readyState == "complete") {
		domReady = true;
		setTimeout(d.ok);
		return d.promise;
	}

	function readyLsn() {
		document.removeEventListener('DOMContentLoaded', readyLsn);
		window.removeEventListener('load', readyLsn);
		if (domReady) return;
		domReady = true;
		d.ok();
	}
	document.addEventListener('DOMContentLoaded', readyLsn);
	window.addEventListener('load', readyLsn);

	return d.promise;
}

export function ui(val) {
	let solve, p;
	if (document.hidden || document.visibilityState == "hidden" || document.visibilityState == "prerender") {
		p = new Promise(function(resolve) {
			solve = resolve;
		});
		document.addEventListener('visibilitychange', listener, false);
	} else {
		p = P();
	}
	const sp = p.then(function() {
		return styles(document.head);
	}).then(function() {
		return sp.fn(val);
	});
	return sp;

	function listener() {
		if (!document.hidden || document.visibilityState == "visible") {
			document.removeEventListener('visibilitychange', listener, false);
			solve();
		}
	}
}

export function styles(head, old) {
	const knowns = {};
	let thenFn;
	const sel = 'link[rel="stylesheet"]';
	if (old && head != old) {
		for (const item of Utils.all(old, sel)) {
			knowns[item.href] = true;
		}
		thenFn = node;
	} else {
		thenFn = sheet;
	}
	return Promise.all(
		Utils.all(head, sel).filter(function(item) {
			return !knowns[item.href];
		}).map(thenFn)
	);
}

export function sheet(link) {
	let ok = false;
	try {
		ok = link.sheet && link.sheet.cssRules;
	} catch(ex) {
		// bail out
		ok = true;
	}
	if (ok) return Promise.resolve();
	const nlink = link.cloneNode();
	nlink.media = "unknown";
	const p = node(nlink);
	const parent = link.parentNode;
	parent.insertBefore(nlink, link.nextSibling);
	return p.then(function() {
		parent.removeChild(nlink);
	});
}

export function node(item) {
	return new Promise(function(resolve) {
		function done() {
			item.removeEventListener('load', done);
			item.removeEventListener('error', done);
			resolve();
		}
		item.addEventListener('load', done);
		item.addEventListener('error', done);
	});
}

