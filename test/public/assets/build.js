window.test = [];
Page.build(function(state) {
	document.body.dataset.path = state.pathname;
});

Page.setup(function(state) {
	window.test.push("|", document.body.dataset.path);
	document.body.innerHTML = window.test.join('');
});
