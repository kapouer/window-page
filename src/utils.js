export class Deferred {
	constructor() {
		this.promise = new Promise((ok, fail) => {
			this.ok = ok;
			this.fail = fail;
		});
	}
}

export class Queue {
	#list = [];
	#on = false;

	queue(job) {
		const d = new Deferred();
		d.promise = d.promise.then(() => {
			return job();
		}).finally(() => {
			this.#on = false;
			this.#dequeue();
		});
		this.#list.push(d);
		this.#dequeue();
		return d.promise;
	}
	#dequeue() {
		if (this.#on) return;
		const d = this.#list.shift();
		if (d) {
			this.#on = true;
			d.ok();
		}
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
			d.fail(code);
			return;
		}
		if (type) {
			const ctype = this.getResponseHeader("Content-Type") || "";
			if (!ctype.startsWith(type)) {
				aborted = true;
				this.abort();
				d.ok(this);
				return;
			}
		}
		if (rs == 4) d.ok(this);
	};
	xhr.send();
	return d.promise;
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
			// eslint-disable-next-line no-console
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
			if (window.localStorage) {
				const str = window.localStorage.getItem('debug');
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

export const P = function() {
	return Promise.resolve();
};

export function all(node, selector) {
	if (node.queryAll) return node.queryAll(selector);
	const list = node.querySelectorAll(selector);
	if (Array.from) return Array.from(list);
	return Array.prototype.slice.call(list);
}
