window.Page
===========

A general, light, three-staged-chains client page (pre)renderer and router.

Compatible with web components and visibility API.

Designed to degrade gracefully on old browsers - can work without history API.


Install
-------

```
npm install window-page
ln -s node_modules/window-page/window-page.js public/js/
```
then load the script in a web page.


Usage
-----

window.Page is a static object, it does not hold any state.

```
// get data and document from location
Page.route(function(page) {
	GET(page.pathname + '.json').then(function(data) {
		// not mandatory property name, but a good idea to avoid future collisions
		page.data = data;
		return GET(data.template, {type: "document"});
	}).then(function(doc) {
		page.document = doc;
	});
});

// merge data into DOM (can fetch more remote data) - no user interactions yet
Page.build(function(page) {
	Domt.merge(document.body, page.data);
});

// initialize user interactions
Page.handle(function(page) {
	$('.dropdown').dropdown(); // typical semantic dropdown initializer
});
```


API
---

### page object

The page object extends a standard URL instance

* page.pathname, search, hostname, protocol...
  the usual properties
* query  
  the parsed query string.

When Page.format(page) is called, the query object is stringified first, then
it returns the result of location.toString.

It has some extra properties that are passed along to all fn functions

* page.document  
  set by the route chain to a DOM document that is imported into window.document

* page.updating  
  is set to true if the currently run chain function has already run once on
  the current document instance.

* page.data  
  Optional for now.  
  this is where application data should be kept, if any.  
  It is also a good idea to make sure that data is serialized.


### Chains setup

* Page.route(fn)
* Page.build(fn)
* Page.handle(fn)

The return values of the promises are ignored.

All functions receive the same "page" parameter.


### History

* Page.push(page or url)

* Page.replace(page or url)


### Tools

* Page.parse(url)  
  parses a url and its query

* Page.format(obj)  
  format a parsed url - if obj is not a URL instance, only the specified parts
  are returned, not the absolute url.


Run chains
----------

There are three chains (route, build, handle) that accepts thenables.

The first time the document is parsed into a DOM, it is "initial", and the
second time it is "revived" (it has been initial then built and serialized then
reopened elsewhare).

Chains are always run after DOM is ready.

Between route and build chain, if page.document has not been imported,
it is imported into it and the build chain is run when the import is finished
and its scripts and import links are loaded.

The handle chain is never run when prerendering.

### 1. Initial document - construction

DOM Ready on new document, or page.document has not been imported:
- route
- build
- handle

### 2. Initial or revived document - navigation

Page.replace, or Page.push call:
- build
- handle

### 3. Revived document - opening

DOM Ready on built document:
- handle


Application behaviors
---------------------

- route functions typically sets `page.data` (or anything else that does not
conflict with existing properties)
- the second time a chain is run on current document, `page.updating == true`

### Reload or update

Both are characterized by `page.updating` being true.

When using Page.push or Page.replace, it is up to the application build and
handle functions to deal with being run several times.


### Open new url

Because of the need to get new data and document, simply do
```
Page.push(newHref)
```


Example: update when query change
---------------------------------

In a js file that deals with application routers:

```
Page.route(function(page) {
	// GET(...) same usage as above
});
```

In another (possibly page related) js file:
```
Page.build(function(page) {
	if (page.data) {
		// application understands this as not updating the page
		myMerge(page.data.articles);
	}
	// the update part of the build
	var query = page.query;
	GET({pathname: "/api/data", query: query}).then(function(obj) {
		myMergeUpdate(obj);
	});
});

Page.handle(function(page) {
	if (!page.updating) $('form').on('submit', function(e) {
		e.preventDefault();
		// push to history, triggers routers chain which in turn will call update()
		page.query = $(this).form('get values');
		// doesn't run routers chain because we're pushing an existing page with
		// a document already set
		Page.push(page);
	});
});
```


License
-------

See LICENSE file.

