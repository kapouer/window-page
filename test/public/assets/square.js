Page.setup(function() {
	if (document.body.offsetWidth == 400) {
		document.querySelector('.status').innerHTML = "squared";
	} else {
		document.querySelector('.status').innerHTML = "not";
	}
});

