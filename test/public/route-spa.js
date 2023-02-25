Page.route(state => {
	window.doc1 = `<!DOCTYPE html>
	<html lang="en">
	<head>
		<title>first</title>
		<script src="/window-page.js"></script>
		<script src="/tools.js"></script>
		<script src="/route-spa.js"></script>
		<script src="/spa.js"></script>
	</head>
	<body>first</body>
</html>`;
	window.doc2 = `<!DOCTYPE html>
	<html lang="fr" data-removed="true">
	<head>
		<title>two</title>
		<script src="/tools.js"></script>
		<script src="/route-spa.js"></script>
		<script src="/spa.js"></script>
	</head>
	<body>two</body>
</html>`;

	if (state.pathname == "/templates/route-spa.html") state.doc = Page.createDoc(window.doc1);
	else if (state.pathname == "/anything.html") state.doc = Page.createDoc(window.doc2);
	else state.doc = document;
});
