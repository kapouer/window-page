window.Page
===========

Runs promise-based lifecycle page chains.

and integrates with:

- custom elements
- link imports
- visibility API, when prerendering is done on server
- history API

Chains
------

- init, called before anything but after original document is ready
- router, if pathname changes or page is new,
- state.import(doc) which does nothing if document does not change
- ready, when imported document or original document is ready
- build, fetch data and fill document if doc is not built or pathname has changed
- patch, fetch additional data and update document if doc is not patched and query has changed
- setup, when not prerendering
- hash, the location hash has changed, `state.hash` is set.
- close, use it to clean what has been done in setup
- error, a fatal error happened during page run, `state.error` is set.

A run is triggered by navigation (document.location changed in any way, or
page history methods called, see below).


Route
-----

To build a page one needs a document that depends on current location.

A page always start with some markup, so the default router is not run when
the page is loaded before any change.

A router can be set using `Page.route(function(state) {...})` and shall return
a document (possibly using `Page.get` and `Page.createDoc`).
The default return value is current document.


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
		return Page.parseDoc(str);
	});
});

// merge data into DOM (can fetch more remote data) - no user interactions yet
// maybe called several times per imported document
Page.build(function(state) {
	matchdom(document.body, state.data);
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

### chains

For each chain, one can add or remove a listener function that receives the
current state as argument.

* Page[chain](fn)  
  runs fn right now if the chain is reached, or wait the chain to be run
* Page[`un${chain}`](fn)  
  removes fn from a chain

Functions listening for a given stage are run serially.

Listeners are bound to `document.currentScript`:
- if it is set, listeners are bound to it and are removed as the node itself is.  
  Script node removal can happen when loading a new document.
- if it is not set, the listener is bound to current state: next state will just
  drop it.

### state

The state object describes components of the url parsed with Page.parse()

* state.pathname, state.query, state.hash  
  see also Page.format(state)

**Important**: do not mutate those properties, instead, use `Page.parse(state)` to
get a copy, or pass an object with partial properties to `Page.push` or `Page.replace`.

* state.data  
  the data must be JSON-serializable.

* state.referrer  
  the previous parsable state.

Shorthand state methods are also available:

* state.save()  
* state.replace(loc or url)  
* state.push(loc or url)  
* state.reload()  

See Page history methods.


### Integration with Event delegation, removal of body listeners

When importing a document, two methods are called:
- state.setHead(node)
- state.setBody(node)

The default `setHead` method do DOM diffing to keep existing script and link
nodes.
The default `setBody` method just replaces `document.body` with the new body.

Thus it is safer to add event listeners (during Page.setup) on `document.body`,
since it is replaced, listeners will be cleaned up automatically.

However when overriding `state.setBody`, the new method could keep the same body,
so Page will track and remove body listeners to match the default behavior.


### Integration with Custom Elements

Typical example with patch chain:
```
init() {
  this.patch = this.patch.bind(this);
}
connectedCallback() {
  Page.patch(this.patch);
}
disconnectedCallback() {
  Page.unpatch(this.patch);
}
patch(state) {
  // do something with state.query...
}
```

### Integration with link imports

When importing a document, scritps and link imports are serially loaded in order.


### History

* Page.push(location or url, state)  
  state must be the current state

* Page.replace(location or url, state)  
  state must be the current state

* Page.save(state)  
  Saves the state to history.

* Page.reload(state)  
  reloads state


### Tools

* Page.get(url, statusRejects)  
  statusRejects defaults to 400.  
  Fetch the url and return a string as promised.

* Page.createDoc(str)  
  returns an HTML document from a string.

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


### BrowserStack and Browser support

This project runs its tests on multiple desktop and mobile browsers using [travis BrowserStack addon](https://docs.travis-ci.com/user/browserstack/), sponsored by [BrowserStack](browserstack.com).

[![Browser Stack Logo](https://cloud.githubusercontent.com/assets/131406/22254315/87f2c136-e254-11e6-9a25-587b2247cc30.png)](https://www.browserstack.com/)

Tested on:

- latest versions of Chrome, Firefox, Safari
- iPhone >= 5
- IE >= 10 (with URL and Promise polyfills)
- Edge >= 13
- android browser (on Samsung Galaxy S5)

It might work on IE9, but tests rely on a feature not available there
(getting a DOM document from XHR request).

[![Build Status](https://travis-ci.org/kapouer/window-page.svg?branch=master)](https://travis-ci.org/kapouer/window-page)
![BrowserStack Status](https://www.browserstack.com/automate/badge.svg?badge_key=MndLTXRsN2RKampOTGJEVmVVdmtONnhOTkxDV25KOXdGa0RnNTNWcTJUMD0tLU8xUWJJY0RqK2xpYzNQcUhxUEFIZGc9PQ==--6b7064ec4dca4fb4a26f955db807a43e32f2a2c3)


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


License
-------

MIT, see LICENSE file.

