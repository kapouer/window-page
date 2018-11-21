Page.route(function(state) {
	window.doc1 = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<title>first</title>
		<script src="/spa.js"></script>
	</head>
	<body>first</body>
</html>`;
	window.doc2 = `<!DOCTYPE html>
	<html lang="fr" data-removed="true">
	<head>
		<title>two</title>
		<script src="/spa.js"></script>
	</head>
	<body>two</body>
</html>`;

	if (state.pathname == "/templates/route-spa.html") return Page.createDoc(window.doc1);
	else if (state.pathname == "/anything.html") return Page.createDoc(window.doc2);
});
