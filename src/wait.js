import { Deferred, queryAll, once } from './utils';

let domReady = false;
function readyLsn() {
	if (!domReady) {
		domReady = true;
		return true;
	}
}

export function DOMQueue() {
	if (domReady) return;
	const d = new Deferred();
	if (document.readyState == "complete") {
		domReady = true;
		setTimeout(d.resolve);
		return d;
	}
	return Promise.race([
		once(document, 'DOMContentLoaded', readyLsn),
		once(window, 'load', readyLsn)
	]);
}

export class Queue {
	#list = [];
	#on = false;
	done = new Deferred();
	started = false;
	stopped = false;

	constructor() {
		this.count = 0;
	}

	get length() {
		return this.#list.length;
	}

	queue(job) {
		this.stopped = false;
		const d = new Deferred();
		const p = d.then(() => job()).finally(() => {
			this.#on = false;
			this.dequeue();
		});
		this.#list.push(d);
		this.dequeue();
		return p;
	}
	dequeue() {
		this.started = true;
		if (this.#on) {
			return;
		}
		const d = this.#list.shift();
		if (d) {
			this.count++;
			this.#on = true;
			d.resolve();
		} else {
			this.stopped = true;
			this.done.resolve();
		}
	}
}

function isDocVisible() {
	return !document.hidden || document.visibilityState == "visible";
}

export class UiQueue {
	// run last job when doc is visible, then run all jobs
	#d = new Deferred();
	#job;
	constructor() {
		this.#d.then(() => {
			this.#d = null;
			const job = this.#job;
			if (job) {
				this.#job = null;
				return job();
			}
		});
		if (!isDocVisible()) {
			once(document, 'visibilitychange', isDocVisible).then(this.#d.resolve);
		} else {
			setTimeout(this.#d.resolve, 0);
		}
	}
	run(job) {
		if (this.#d) {
			this.#job = job;
		} else {
			job();
			this.#job = null;
		}
	}
}

export function waitStyles() {
	return Promise.all(
		queryAll(
			document.head,
			'link[rel="stylesheet"]'
		).map(node => waitSheet(node))
	);
}

function waitSheet(link) {
	let ok = false;
	try {
		ok = link.sheet && link.sheet.cssRules;
	} catch(ex) {
		// bail out
		ok = true;
	}
	if (ok) return;
	return once(link, ['load', 'error']);
}

export function loadNode(node) {
	const tag = node.nodeName;
	const isScript = tag == "SCRIPT";
	const copy = node.ownerDocument.createElement(tag);
	for (const attr of node.attributes) {
		let { name } = attr;
		if (isScript) {
			if (name == "type") {
				continue;
			} else if (name == "priv-type") {
				name = "type";
			}
		} else if (name == "rel") {
			continue;
		} else if (name == "priv-rel") {
			name = "rel";
		}
		copy.setAttribute(name, attr.value);
	}

	if (isScript && node.textContent && !node.src) {
		copy.textContent = node.textContent;
		node.parentNode.replaceChild(copy, node);
	} else {
		const p = once(copy, ['load', 'error']);
		node.parentNode.replaceChild(copy, node);
		return p;
	}
}
