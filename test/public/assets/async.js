Page.build(state => {
	document.head.insertAdjacentHTML('beforeEnd', '<script src="assets/build.js"></script>');
	document.body.dataset.path = state.pathname;
});
