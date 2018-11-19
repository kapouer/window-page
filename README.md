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

A router returns a DOM document from current state.

A page always start with some markup, so the default router is not run when
the page is loaded before any change. This means pure SPA needs to define a
custom router, while prerendered websites can just use the default router.

A router can be set within `Page.init`:
```
Page.init(function(state) {
  state.router = function(state) {
    return Page.get(state).then(function(str) {
      return Page.createDoc(str);
    });
  };
});
```
Alternatively, it can be set with `Page.route(function(state) {...})`, which
does exactly the same (it overwrites router).


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
	$('#open').on('click', function() {
		state.push(this.href);
	});
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
  removes fn from a chain, mostly needed for custom elements.

The fn parameter can be a function or an object with a `<chain>` property that
is a function - which is a handy way to keep the value of `this`.

Functions listening for a given stage are run serially.

If a stage chain is already resolved, new listeners are just appended to it.
So to append a listener at the end of the chain, just do:
`Page.patch(() => Page.patch(fn))`.

Listeners are bound to `document.currentScript`:
- if it is set, listeners are bound to it and are removed as the node itself is.  
  Script node removal can happen when loading a new document.
- if it is not set, the listener is bound to current state: next state will just
  drop it.

### state

The state object describes components of the url parsed with Page.parse()

* state.pathname, state.query, state.hash  
  see also Page.format(state)

**Important**: do not mutate those properties.
The state history methods accept partial objects.

* state.data  
  the data must be JSON-serializable.

* state.referrer  
  the previous parsable state.


### Document import

When importing a document, two methods (that can return a promise) are called:
- state.mergeHead(head, prev)
- state.mergeBody(body, prev)

The default `mergeHead` method do DOM diffing to keep existing script and link
nodes.
The default `mergeBody` method just replaces `document.body` with the new body.

These methods can be overriden from `Page.init` or `Page.route`.


### Event listeners on window, document are tracked and removed

So if there is a special need to avoid that behavior, register listeners on
documentElement or body.


### Integration with Custom Elements

A custom element having `build`, `patch`, `setup`, `close` methods can be
plugged into Page using:

* Page.connect(node)
* Page.disconnect(node)

```
connectedCallback() {
  Page.connect(this);
}
disconnectedCallback() {
  Page.disconnect(this);
}
patch(state) {
  var index = state.query.index || 0;
  if (this.slider.index != index) {
    this.slider.setIndex(index);
  }
}
setup(state) {
  this.slider = new Slider(this, {
    change: function(index) {
      state.push({query: {index: index}});
    }
  });
}
close() {
  if (this.slider) this.slider.destroy();
  delete this.slider;
}
```


### Integration with link imports

When importing a document, scritps and link imports are serially loaded in order.


### History

These methods will run all chains on new state and return a promise:

* state.push(location or url)  
* state.replace(location or url)
* state.reload()

A convenient method only replaces current window history:

* state.save()


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

* Page.sameDomain(a, b)  
  compare domains (protocol + hostname + port) of two url or objects.

* Page.samePathname(a, b)  
  compare domains and pathname of two url or objects.

* Page.sameQuery(a, b)  
  compare query strings of two url or objects.

* Page.samePath(a, b)  
  compare domain, pathname, querystring (without hash) of two url or objects.



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


Debug log
---------

Either set `window.debug` to a custom log function, add set local storage:
`window.localStorage.setItem('debug', 'window-page')`.


License
-------

MIT, see LICENSE file.

