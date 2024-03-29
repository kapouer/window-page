window.counters = {};

class HTMLXLinkElement extends HTMLElement {
	get href() {
		return this.getAttribute('href');
	}
	set href(val) {
		this.setAttribute('href', val);
	}
	connectedCallback() {
		Page.connect(this);
	}
	disconnectedCallback() {
		Page.disconnect(this);
	}
	handleClick(e, state) {
		state.push(this.href);
	}
	setup(state) {
		document.body.dataset.setup = parseInt(document.body.dataset.setup || 0) + 1;
	}
	close(state) {
		document.body.dataset.close = parseInt(document.body.dataset.close || 0) + 1;
	}
}

window.customElements.define("x-link", HTMLXLinkElement);

Page.route(state => {
	if (window.routed) {
		state.doc = Page.createDoc(document.documentElement.outerHTML);
	} else {
		state.doc = document;
		window.routed = true;
	}
});

