export class Deferred extends Promise {
	constructor() {
		let pass, fail;
		super((resolve, reject) => {
			pass = resolve;
			fail = reject;
		});
		this.resolve = obj => pass(obj);
		this.reject = err => fail(err);
	}
	static get [Symbol.species]() {
		return Promise;
	}
	get [Symbol.toStringTag]() {
		return 'Deferred';
	}
}

export function get(url, statusRejects, type) {
	if (!statusRejects) statusRejects = 400;
	const d = new Deferred();
	const xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	let aborted = false;
	xhr.onreadystatechange = function() {
		if (aborted) return;
		const rs = this.readyState;
		if (rs < 2) return;
		const code = this.status;
		if (code < 200 || code >= statusRejects) {
			aborted = true;
			this.abort();
			d.reject(code);
			return;
		}
		if (type) {
			const ctype = this.getResponseHeader("Content-Type") || "";
			if (!ctype.startsWith(type)) {
				aborted = true;
				this.abort();
				d.resolve(this);
				return;
			}
		}
		if (rs == 4) d.resolve(this);
	};
	xhr.send();
	return d;
}

export function createDoc(str) {
	let doc;
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
			console.error(ex);
		}
	}
	return doc;
}

let debugFn;
let debugOn = null;
export const debug = (function() {
	if (debugFn) return debugFn;
	if (window.debug) {
		debugFn = window.debug;
	} else {
		if (debugOn === null) {
			debugOn = false;
			const str = window.localStorage?.getItem('debug');
			if (str !== null) {
				debugOn = (str || '').toLowerCase().split(' ').indexOf('window-page') >= 0;
			}
		}
		if (!debugOn) {
			debugFn = function() {};
		} else {
			debugFn = console.info.bind(console);
		}
	}
	return debugFn;
})();

export function queryAll(node, selector) {
	if (node.queryAll) return node.queryAll(selector);
	const list = node.querySelectorAll(selector);
	if (Array.from) return Array.from(list);
	return Array.prototype.slice.call(list);
}

export function once(emitter, events, filter) {
	if (!Array.isArray(events)) events = [events];
	const d = new Deferred();
	const listener = (e) => {
		if (!filter || filter(e)) {
			for (const event of events) emitter.removeEventListener(event, listener);
			d.resolve();
		}
	};
	for (const event of events) emitter.addEventListener(event, listener);
	return d;
}
