class HTMLXScrollElement extends HTMLElement {
	connectedCallback() {
		Page.connect(this);
	}
	disconnectedCallback() {
		Page.disconnect(this);
	}
	setup(state) {
		state.connect({
			handleScroll: function(e, state) {
				document.body.dataset.scrolled = "yes";
			}
		}, window);
	}
}

Page.setup(function() {
	window.customElements.define("x-scroll", HTMLXScrollElement);
});

