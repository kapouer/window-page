Page.setup((state) => {
	function getSome(doc) {
		const node = doc.documentElement.cloneNode(true);
		node.querySelector('head').remove();
		return node.outerHTML;
	}
	if (state.pathname == "/templates/route-spa.html") {
		if (state.referrer?.pathname != "/anything.html") {
			setTimeout(() => {
				state.push('/anything.html');
			}, 50);
		} else {
			window.test1 = getSome(document);
		}
	} else if (state.pathname == "/anything.html") {
		setTimeout(() => {
			window.test2 = getSome(document);
			window.history.back();
		}, 50);
	}
});

Page.patch(state => {
	window.patches ??= 0;
	document.documentElement.dataset.patches = ++window.patches;
});
