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
		document.documentElement.dataset.queryTest = state.query.test;
		document.documentElement.dataset.clicks = (parseInt(document.documentElement.dataset.clicks) || 0) + 1;
		state.push(e.target.href);
	}
	patch(state) {
		this.href = Page.format({query: {
			test: (parseInt(state.query.test) || 0) + 1
		}});
	}
}

window.customElements.define("x-link", HTMLXLinkElement);
