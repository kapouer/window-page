Page.setup(function(state) {
	if (document.body.offsetWidth == 500) {
		document.querySelector('.status').innerHTML = "squared";
	} else {
		document.querySelector('.status').innerHTML = "not";
	}
});
