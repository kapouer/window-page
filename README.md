window.Page
===========

Client-side page routing and loading, compatible with web components and
isomorphic server-side rendering.

A work in progress.

Usage
-----

```
npm install window-page
cp node_modules/window-page/window-page.js public/js/
```

This will expose `window.Page` in the browser.


API
---

* Page.state  
  the state object, like history.state but without the serialization woes.

* Page.location  
  current location object, should be the same as document.location.

* Page.parse  
  Parse a query string; without arguments, parses document.location.search.

* Page.stringify  
  Stringify object to query string.

* Page.build(fn)  
  Queue a build function (can be a thenable)  
  If called without argument, execute the builders chain.  

* Page.handle(fn)  
  Queue a handler function (can be a thenable)  
  If called without argument, execute the handlers chain.

* Page.import(doc)  
  Replace current document by another one.  
  Scripts are loaded and run in the right order.  
  Import Links are run after all scripts are loaded.  
  Returns a promise.

* TODO Page.push(state, url | loc)  
  Like history.pushState, triggers build/handle phases and listeners

* TODO Page.replace(state, url | loc)  
  Like history.replaceState, triggers build/handle phases and listeners


States
------

When Page is loaded the first time, and the document has never been built,
and the DOM is ready, the builders chain is run.

When the builders chain ends, and the document is visible,
and all Import links are loaded, the handlers chain is run.

It is also possible to call Page.build() to rerun the builders chain,
followed by the handlers chain under the same conditions as before.

TODO:
Page.push could load a remote document, import it and then call build() on it.
Page.replace, if the document is the same, could update Page.state and call
build() to rebuild the page.


Events
------

* query event  
  emitted when only document.location.search has changed.  
  Listeners receive the query object as parameter.

* error event  
  emitted when an error occurred during build or handle phases.  
  Listeners receive the error object, the phase (building, handling)

