Page.setup((state) => {
	function getSome(doc) {
		const node = doc.documentElement.cloneNode(true);
		node.querySelector('head').remove();
		return node.outerHTML;
	}
	if (state.pathname == "/templates/route-spa.html") {
		if (state.referrer.pathname != "/anything.html") {
			setTimeout(() => {
				state.push('/anything.html');
			}, 100);
		} else {
			window.test1 = getSome(document);
		}
	} else if (state.pathname == "/anything.html") {
		setTimeout(() => {
			window.test2 = getSome(document);
			window.history.back();
		}, 100);
	}
});

