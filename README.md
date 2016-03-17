window.Page
===========

A general, light, three-staged-chains client page (pre)renderer and router.

Compatible with web components and visibility API.

It also presents a higher-level api for window.history, which degrades
gracefully when not natively supported.


Install
-------

```
npm install window-page
ln -s node_modules/window-page/window-page.js public/js/
```
then load the script in a web page.


Usage
-----

```
// get data and document from location
Page.route(function(state) {
	GET(page.pathname + '.json').then(function(data) {
		// not mandatory property name, but a good idea to avoid future collisions
		state.data = data;
		return GET(data.template, {type: "document"});
	}).then(function(doc) {
		state.document = doc;
	});
});

// merge data into DOM (can fetch more remote data) - no user interactions yet
Page.build(function(state) {
	Domt.merge(document.body, state.data);
});

// initialize user interactions
Page.handle(function(state) {
	if (state.update) return;
	$('.dropdown').dropdown(); // typical semantic dropdown initializer
});
```


API
---

### state object

The state object describes components of the url parsed with Page.parse()

* state.pathname, state.query, state.hash  
  see also Page.format(state)

The state object is also the place to keep application data, if any

* state.data    
  It is also a good idea to make sure that data is serializable.

And it has some non-enumerable properties that are passed along to all chain
functions:

* state.document  
  the route chain is supposed to populate this with a DOM document, and when the
  route chain is finished it is imported into window.document before the build
  chain starts.

* state.updating  
  is set to true if the currently run chain function has already run once on
  the current document instance.


### Chains setup

* Page.route(fn)
* Page.build(fn)
* Page.handle(fn)

The return values of the promises are ignored.

All functions receive the same "state" parameter, which ends up being available
as `Page.state`.


### History

* Page.window  
  change history of which window, default to `window`

* Page.state  
  the current state

* Page.push(state or url)

* Page.replace(state or url)


### Tools

* Page.parse(url)  
  parses a url and fill only properties that were defined in the url,  
  parses the query string into an object if any.

* Page.format(obj)  
  format a parsed url to a string with only what was defined,  
  converts obj.path to pathname, query then stringify query obj if any.


Run chains
----------

There are three chains (route, build, handle) that accepts thenables.

The first time the document is parsed into a DOM, it is "initial", and the
second time it is "revived" (it has been initial then built and serialized then
reopened elsewhare).

Chains are always run after DOM is ready.

Between route and build chain, if state.document has not been imported,
it is imported into it and the build chain is run when the import is finished
and its scripts and import links are loaded.

The handle chain is never run when prerendering.

### 1. Initial document - construction

DOM Ready on new document, or state.document has not been imported:
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

- route functions typically sets `state.data` (or anything else that does not
conflict with existing properties)
- the second time a chain is run on current document, `state.updating == true`

### Reload or update

Both are characterized by `state.updating` being true.

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
Page.route(function(state) {
	// GET(...) same usage as above
});
```

In another js file:
```
Page.build(function(state) {
	if (state.data) {
		// application understands this as not updating the state
		myMerge(state.data.articles);
	}
	// the update part of the build
	var query = state.query;
	GET({pathname: "/api/data", query: query}).then(function(obj) {
		myMergeUpdate(obj);
	});
});

Page.handle(function(state) {
	if (!state.updating) $('form').on('submit', function(e) {
		e.preventDefault();
		// push to history, triggers routers chain which in turn will call update()
		state.query = $(this).form('get values');
		// doesn't run routers chain because we're pushing an existing state with
		// a document already set
		Page.push(state);
	});
});
```


License
-------

See LICENSE file.

