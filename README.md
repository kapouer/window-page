window.Page
===========

A general, light, client page controller for running promise-based chains:

- route, matching url with document and data
- build, filling the document using collected data
- patch, optionally updating document
- setup, adding listeners on delegated events and initializing global objects

window.Page is designed to play well with:

- webcomponents and link imports
- visibility API, when prerendering is done on server
- history API, supporting single or multiple pages applications or mixes of both

and degrades gracefully when these features are not supported on client.


Browser support
---------------

[![Build Status](https://travis-ci.org/kapouer/window-page.svg?branch=master)](https://travis-ci.org/kapouer/window-page)
![BrowserStack Status](https://www.browserstack.com/automate/badge.svg?badge_key=MndLTXRsN2RKampOTGJEVmVVdmtONnhOTkxDV25KOXdGa0RnNTNWcTJUMD0tLU8xUWJJY0RqK2xpYzNQcUhxUEFIZGc9PQ==--6b7064ec4dca4fb4a26f955db807a43e32f2a2c3)

Tested on:

- latest versions of Chrome, Firefox, Safari
- iPhone >= 5
- IE >= 10 (with URL and Promise polyfills)
- Edge >= 13
- android browser (on Samsung Galaxy S5)

It might work on IE9, but tests rely on a feature not available there
(getting a DOM document from XHR request).


### BrowserStack

This project runs its tests on multiple desktop and mobile browsers using [travis BrowserStack addon](https://docs.travis-ci.com/user/browserstack/), sponsored by [BrowserStack](browserstack.com).

[![Browser Stack Logo](https://cloud.githubusercontent.com/assets/131406/22254315/87f2c136-e254-11e6-9a25-587b2247cc30.png)](https://www.browserstack.com/)


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

### stage serialization, root node

The current construction stage of a document is saved into the first node having
a `data-page-stage` attribute, and defaults to documentElement if none is found.

This node is called the `root node`, and is accessible through `Page.root`.

The root node can be different after route chain imports a document.

If one needs to export a part of the document, that part should carry that
attribute, to ensure Page will be able to resume loading at the correct stage.

The root node can also be used to store custom data with
`Page.store(name, data)`: reads or writes JSON data.


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
* Page.patch(fn)
* Page.setup(fn)

The return values of the promises are ignored.

All functions receive the same "state" parameter, which is available just before
build chain as `Page.state`.


### Events

Page emits events "pageinit", "pageroute", "pagebuild", "pagepatch", "pagesetup"
on window, the last four happening after the corresponding chain has run.

In addition, a "pagehash" event is emitted when only the document hash changes,
to be able to do stuff on hash links without interfering with history api.


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

There are four chains (route, build, patch, setup) that accepts thenables.

The first time the document is parsed into a DOM, it is in its 'initial' state,
the second time it is 'prerendered'; meaning it has been built once, serialized,
then reopened later in a browser.

Chains are always run after DOM is ready.

When the route chain has finished, if state.document has not been imported,
it is imported into current document, scripts and import links being loaded
in order.

The build chain is not run when reopening a prerendered document.

The patch chain is run after the build chain the first time, and, if it is not
empty, in place of the build chain in case of a document update.

The setup chain is not run when prerendering.



### 1. Initial document - construction

DOM Ready on new document, or state.document has not been imported:
- route
- build
- patch
- setup (if not prerendering)

### 2. Initial or prerendered document - navigation

Page.replace, or Page.push calls:
- build, if the patch chain is empty
- patch

### 3. Prerendered document - opening

DOM Ready on built document:
- setup


Application behaviors
---------------------

### build functions - run once or multiple times

If patch chain is empty, it is up to the build chain to deal with being called
multiple times (typically after a Page.replace or Page.push call).

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

Optionally, some code deals with application routing and sets data

```
Page.route(function(state) {
	state.data = {articles: [...]};
});
```

In another js file:
```
Page.build(function(state) {
	// called once during prerendering, use already set data or fetch some
	myMerge(state.data.articles);
});

Page.patch(function(state) {
	GET({
		pathname: "/api/data",
		query: state.query
	}).then(function(obj) {
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

