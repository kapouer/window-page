window.Page
===========

A general, light, client page controller for running the:

- route, matching url with document and data
- build, filling the document using collected data
- setup, adding listeners on delegated events and initializing global objects

window.Page is designed to play well with:

- webcomponents and link imports
- visibility API, when prerendering is done on server
- history API, supporting single or multiple pages applications or mixes of both

and degrades gracefully when these features are not supported on client.


Install
-------

Manual installation is simple:
```
npm install window-page
ln -s node_modules/window-page/window-page.js public/js/
```
then add a script tag in a web page, before the application scripts that
use the chain methods.


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
// maybe called several times per imported document
Page.build(function(state) {
	if (state.data) Domt.merge(document.body, state.data);
});

// initialize user interactions, called only once per instantiated document,
// after route/import/build.
Page.setup(function(state) {
	// global, static ui elements can be initialized here
	// if a build function adds more dropdowns, it is responsible for initializing
	// them altogether.
	$('.dropdown').dropdown();
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


### Chains

* Page.route(fn)
* Page.build(fn)
* Page.setup(fn)

The return values of the promises are ignored.

All functions receive the same "state" parameter, which is available just before
build chain as `Page.state`.


### Events

Page emits events "route", "build", "setup" on window.


### History

* Page.window  
  change history of which window, default to `window`

* Page.state  
  the current state

* Page.push(state or url)

* Page.replace(state or url)


### Tools

* Page.parse(url)  
  parses a url into pathname, query object, hash; and protocol, hostname, port
  if not the same domain as the document.

* Page.format(obj)  
  format a parsed url to a string with only what was defined,  
  converts obj.path to pathname, query then stringify query obj if any.

* Page.samePath(a, b)  
  compare paths (pathname + querystring without hash) of two url or objects.

* Page.sameDomain(a, b)  
  compare domains (protocol + hostname + port) of two url or objects.


Order of execution of chains
----------------------------

There are three chains (route, build, setup) that accepts thenables.

The first time the document is parsed into a DOM, it is in its 'initial' state,
the second time it is 'prerendered'; meaning it has been built once, serialized,
then reopened later in a browser.

Chains are always run after DOM is ready.

When the route chain has finished, if state.document has not been imported,
it is imported into current document, scripts and import links being loaded
in order.

The build chain is not run when reopening a prerendered document
(but it can be run again when push or replace methods are called).

The setup chain is not run when prerendering.


### 1. Initial document - construction

DOM Ready on new document, or state.document has not been imported:
- route
- build
- setup (if not prerendering)

### 2. Initial or prerendered document - navigation

Page.replace, or Page.push calls:
- build

### 3. Prerendered document - opening

DOM Ready on built document:
- setup

The current construction stage of a document is saved into a documentElement
attribute "stage". It is important to keep it when serializing the document.


Application behaviors
---------------------

### build functions - run once or multiple times

Since build chain is always called on a Page.push or replace, build functions
are expected to deal with being called multiple times.

Some build functions only use `state.data` and will return early if that variable
isn't set.

Other build functions use `state.query` to fetch additional data and refresh
parts of the document.

Since `state.data` is supposed to be set by route functions, its presence means
the document is still being prerendered in its initial phase.


### setup non-webcomponents elements globally

If a build function inserts node elements that need some initialization function
to be called, it has to deal with properly setting up user interface listeners.

It seems to be in contradiction with the idea of using 'setup' chain to do that;
but it is not ! The right way to handle that situation is to delegate initialization
by dispatching events from the build function to a setup function:

```
// runs on initial document or on replaced document
Page.build(function() {
	$('#somenode').append('<div class="dropdown" />');
	$(document).trigger('dropdown');
});

// runs on prerendered document
Page.setup(function() {
	$(document).on('dropdown', function() {
		// initialize added dropdowns
		$('.dropdown').dropdown();
	});
	// initialize prerendered dropdowns
	$('.dropdown').dropdown();
});
```

Webcomponents setup themselves, so that kind of separation is implied by the
fact webcomponents are not prerendered by Page.import - they are only rendered
so they initialize only when the document is visible to the user.


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

Page.setup(function(state) {
	$('form').on('submit', function(e) {
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

MIT, see LICENSE file.

