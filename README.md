window.page
===========

A work in progress.

Usage
-----

```
npm install window.page
cp node_modules/window.page/window.page.js public/js/
```

This will expose `window.page` in the browser.


API
---

* page.state  
  the state object, like history.state but without the serialization woes.

* page.location  
  current location object, should be the same as document.location.

* page.parse  
  Parse a query string; without arguments, parses document.location.search.

* page.stringify  
  Stringify object to query string.

* page.build(fn)  
  Queue a build function (can be a thenable)  
  Guaranteed to be called once after DOM is ready (and webcomponents are ready).  
  If called without argument, recalls all.

* page.handle(fn)  
  Queue a handler function (can be a thenable)  
  Guaranteed to be called once after DOM is ready and page has been built.  
  If called without argument, recalls all.

* query event  
  emitted when only document.location.search has changed.  
  Listeners receive the query object as parameter.

* error event  
  emitted when an error occurred during build or handle phases.  
  Listeners receive the error and the phase name as parameters.

