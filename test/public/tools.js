Page.constructor.prototype.createDoc = function (str) {
	let doc;
	try {
		doc = (new window.DOMParser()).parseFromString(str, "text/html");
	} catch (ex) {
		try {
			doc = document.cloneNode(false);
			doc.open();
			doc.write(str);
			doc.close();
		} catch (ex) { /* pass */ }
	}
	if (doc && !doc.documentElement && doc.children.length == 1) {
		// firefox
		try {
			doc.documentElement = doc.firstElementChild;
		} catch (ex) {
			console.error(ex);
		}
	}
	return doc;
};


Page.constructor.prototype.get = function (url, statusRejects, type) {
	if (!statusRejects) statusRejects = 400;
	const xhr = new XMLHttpRequest();
	xhr.open("GET", url, true);
	let aborted = false;
	return new Promise((resolve, reject) => {
		xhr.onreadystatechange = function () {
			if (aborted) return;
			const rs = this.readyState;
			if (rs < 2) return;
			const code = this.status;
			if (code < 200 || code >= statusRejects) {
				aborted = true;
				this.abort();
				reject(code);
				return;
			}
			if (type) {
				const ctype = this.getResponseHeader("Content-Type") || "";
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

Page.route(state => {
	state.finish(async () => {
		if (state.doc) return;
		const url = state.toString();
		const client = await state.get(url, 500, 'text/html');
		let doc;
		if (client.status >= 200) {
			doc = Page.createDoc(client.responseText);
			if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
				throw new Error(client.statusText);
			}
		}
		if (!doc) throw new Error("Cannot load remote document");
		state.doc = doc;
	});
});

