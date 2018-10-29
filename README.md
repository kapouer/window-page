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

Chains are always run after DOM is ready.

- init, always called at start of a page run
- route, allows one to load a remote document and import it with its assets
- build, fetch data and fill document
- patch, when query changes, fetch data and update document
- setup, UI, events animations
- close, use it to clean what has been done in setup
- error, a fatal error happened during page run, `state.error` is set.
- hash, the location hash has changed, `state.hash` is set.

A run is triggered by navigation (document.location changed except hash).

Route and build chains are called when pathname changes and if the page has not
been built once and reopened (as with prerendering).

Patch chain is called after build, and also when query changes.

Setup chain is called when document is visible and stylesheets are loaded.


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

### chains

For each chain, two functions are available:

* Page[chain](fn)  
  runs fn right now if the chain is reached, or wait the chain to be run
* Page[`un${chain}`](fn)  
  removes fn from a chain

The function receives one argument: the state object.
A chain is a promise that runs each function serially.


### state

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

It is possible to access `Page.state`, which is the page state of the last run.


### window.Page.root

Defaults to documentElement.

If one needs to export a part of the document, that part should carry that
attribute, to ensure Page will be able to resume loading at the correct stage.


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

