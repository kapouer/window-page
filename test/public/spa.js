Page.setup(function(state) {
	if (state.pathname == "/templates/route-spa.html") {
		if (state.referrer.pathname != "/anything.html") {
			setTimeout(function() {
				state.push('/anything.html');
			}, 100);
		} else {
			window.test1 = document.documentElement.outerHTML;
		}
	} else if (state.pathname == "/anything.html") {
		setTimeout(function() {
			window.test2 = document.documentElement.outerHTML;
			window.history.back();
		}, 100);
	}
});

