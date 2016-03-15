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

The object passed to functions holds the current page state, see below.


```
// get data and document from location
Page.route(function(page) {
	GET(page.pathname + '.json').then(function(data) {
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

### page properties

The page object has the same properties as a URL instance, along with

* page.query  
  the parsed query string

* page.document  
  the document set by routers chain for import


### Chains

There are three chains (route, build, handle) that accepts thenables.

* Page.route(fn)  
  Queue a route function.  

* Page.build(fn)  
  Queue a build function  

* Page.handle(fn)  
  Queue a handler function  

The return value of the thenables is ignored.


### History

* Page.push(page or url)

* Page.replace(page or url)

The page object is first converted to a url, appended or replacing current
document.location (if window.history API is available).

Then depending on page.document, routers chain is run, or directly
builders chain, see below.


### Tools

* Page.parse(url)  
  parses a url and its query

* Page.format(obj)  
  format a parsed url


Lifecycle
---------

window.Page instance is created after window-page.js is loaded, then user scripts
append thenables to the route/build/handle chains.

The page might have already been built and serialized once, in which case
`page.document = document;` and the handlers chain is run directly.

Else the routers chain is run; when it ends
- page.document is imported into window.document if set and not already done;
  this importation means new scripts are loaded, in which case all chains are
  reset,
- then builders are run

When builders chain ends:
- if window.visibilityState == 'prerender' it stops there
- else the handlers chain is run

Page.push/replace can be called with an object that has a document, in which
case the routers chain jumps to its end directly. This is useful for rebuilding
a page without refetching its document and/or its data.

For example, to rebuild a page with a new page in the same document, just do
```
Page.replace({
	data: someData,
	document: document
});
```
or even simpler, if the page argument is available:
```
page.data = someData;
Page.replace(page);
```
Both won't call the routers chain.


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
	if (page.search == location.search) {
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
	$('form').on('submit', function(e) {
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

