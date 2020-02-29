window.repatched = (window.repatched || 0) + 1;
Page.patch(function(state) {
	document.body.dataset.repatched = (parseInt(document.body.dataset.repatched) || 0) + 1;
});
