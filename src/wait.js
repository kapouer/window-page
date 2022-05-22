import { Deferred, queryAll, once } from './utils';

let domReady = false;
function readyLsn() {
	if (!domReady) {
		domReady = true;
		return true;
	}
}

export function dom() {
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

export function styles(head, old) {
	const knowns = {};
	let thenFn;
	const sel = 'link[rel="stylesheet"]';
	if (old && head != old) {
		for (const item of queryAll(old, sel)) {
			knowns[item.href] = true;
		}
		thenFn = node;
	} else {
		thenFn = sheet;
	}
	return Promise.all(
		queryAll(head, sel).filter(item => !knowns[item.href]).map(thenFn)
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
	if (ok) return;
	const nlink = link.cloneNode();
	nlink.media = "unknown";
	const p = node(nlink);
	const parent = link.parentNode;
	parent.insertBefore(nlink, link.nextSibling);
	return p.then(() => parent.removeChild(nlink));
}

export function node(item) {
	return once(item, ['load', 'error']);
}

