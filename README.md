window.Page
===========

A general, light, client page controller for running promise-based chains:

- route, matching url with document and data
- build, filling the document using collected data
- patch, optionally updating document
- setup, setting up UI, adding listeners on delegated events, starting animations...

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

window-page is also a commonjs module, so it can be used with `require`.


Usage
-----

```
// get data and document from location
Page.route(function(state) {
	return fetch(page.pathname + '.json').then(function(res) {
		return res.json();
	}).then(function(data) {
		// not mandatory property name, but a good idea to avoid future collisions
		state.data = data;
		return fetch(data.template).then(function(res) {
			return res.text();
		});
	}).then(function(str) {
		state.document = document.cloneNode(false);
		state.document.innerHTML = str;
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

### stages and root node

The current construction stage of a document is saved into the first node having
a `data-page-stage` attribute, and defaults to documentElement if none is found.

This node is called the `root node`, and is accessible through `Page.root`.

The root node can be different after route chain imports a document.

If one needs to export a part of the document, that part should carry that
attribute, to ensure Page will be able to resume loading at the correct stage.

There are five stages:

- 0: init
- 1: imported
- 2: built
- 3: setup
- 4: closing


### state object

The state object describes components of the url parsed with Page.parse()

* state.pathname, state.query, state.hash  
  see also Page.format(state)

*Important*: it is a bad idea to mutate those properties. Use `Page.parse()` to
get a copy, or pass an object with partial properties to `Page.push` or `Page.replace`.

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
* Page.close(fn)

The return values of the promises are ignored.

All functions receive the same "state" parameter.

A successful run of the chains updates Page.state to the new state (new in
window-page 2).


### Events

Page emits these window events:

- pageinit (before initial run)
- pageroute (after route chain)
- pagebuild (after build chain)
- pagepatch (after patch chain)
- pagesetup (after setup chain)
- pageclose (after close chain)
- pageerror (since version 3.1.0 exposes state.error)
- pagehash (document hash has changed)

Listeners receive an event object with a `state` property being the current
state (which can be different from Page.state - this is new in window-page 2).

The route, build, patch events might not be called, depending on current page
stage. The init event is always called. (New in 3.6.0).

### History

* Page.window  
  change history of which window, default to `window`

* Page.state  
  the last successful state

* Page.referrer  
  Initially a parsed `document.referrer` url object or null if no referrer was
  found, then the previous url object.  
  Available since version 3.3.0.

* Page.push(state or url, curState?)  
  curState is optional, and must be given when push/replace is called before
  current state is final.

* Page.replace(state or url, curState?)  
  curState is optional, and must be given when push/replace is called before
  current state is final.

* Page.reload()  
  reloads current page, starting from initial stage.

* Page.historySave(method, state)  
  method can be `replace` or `push`.  
  Normalizes and saves state using history api.  
  Used by previous methods, and to update state.data.


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

There are five chains (route, build, patch, setup, close) that accepts thenables.

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

The setup chain is not run when prerendering, and waits for stylesheets to be
loaded.

The close chain is run when Page.push/replace results in navigating to a
new document.


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

DOM Ready on built document and styles applied:
- setup

Before the setup chain is called, `document.body` is monkey-patched to be
able to track events setup on body.

This allows navigation to automatically reset events that have been added
during setup chain.

So it is strongly advised to always setup events listeners on `document.body`
and use event delegation technique.

Transitions during navigation should insted use `documentElement` to avoid
getting their transition listeners garbage-collected.

It is also possible to setup events listeners anywhere else, and it's up
to the client code to clean them up. The `close` chain can be useful to do that.


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
	return fetch(Page.format({
		pathname: "/api/data",
		query: state.query
	})).then(function(res) {
		return res.json();
	}).then(function(obj) {
		return myMergeUpdate(obj);
	});
});

Page.setup(function(state) {
	// this listener will be garbage collected automatically when page changes
	document.body.addEventListener('submit', function(e) {
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

