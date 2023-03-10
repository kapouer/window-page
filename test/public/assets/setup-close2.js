Page.setup(state => {
	document.documentElement.dataset.setup = "setup2";
	if (state.pathname == "/setup-close.html") {
		setTimeout(() => {
			state.push('/setup-close2.html');
		}, 100);
	}
});

Page.close(state => {
	document.documentElement.dataset.close = "close2";
});

