# window.Page

Runs promise-based lifecycle page chains.

and integrates with:

- custom elements
- link imports
- visibility API, when prerendering is done on server
- history API

## Chains

- init, called before anything but after original document is ready
- ready, when imported document or original document is ready
- build, fetch data and fill document if doc is not built or pathname has changed
- patch, fetch additional data and update document if doc is not patched and query has changed
- setup, when not prerendering, called once per pathname change (or first view)
- paint, when not prerendering, called after pathname or query changes (or first view)
- hash, the location hash has changed, `state.hash` is set.
- close, use it to clean what has been done in setup of referrer
- error, a fatal error happened during page run, `state.error` is set.

Between init and ready, when the pathname changes, `state.router` can import
a new document, see below.

A run is triggered by navigation (document.location changed in any way, or
page history methods called, see below).

If the `state.error` object is removed from state during the error chain,
the navigation will continue as if the error did not happen.

## Router

State instances have a default router which assumes prerendered web pages:

- it does not run on first page load
- it does fetch a remote web page, to be imported as new document when pathname
changes.

It can be overriden using `Page.route(method)`.

A page defining a custom router should use the default router if it is
prerendered (which happens if the script calling `Page.route` is not in the
prerendered page).

Basic example:

```js
Page.route(function(state) {
 return Page.get(state).then(function(str) {
  return Page.createDoc(str);
 });
});
```

## Usage

```js
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

// merge data into DOM
Page.build(function(state) {
 matchdom(document.body, state.data);
});

// fetch additional data depending on state.query values
Page.patch(function(state) {
 if (state.query.id != null) return fetch('/getdata?id=' + state.query.id)
 .then(function(res) {
  return res.json();
 }).then(function(data) {
  matchdom(template, data);
 });
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

## API

### chains

For each chain, one can add or remove a listener function that receives the
current state as argument.

- `Page[chainLabel](fn)`
  runs fn right now if the chain is reached, or wait the chain to be run
- `Page['un'+chainLabel](fn)`
  removes fn from a chain, mostly needed for custom elements.
- Page.finish(fn?)
  If fn is given, calls `state.queue.then(fn)`.
  Returns `state.queue` anyway.

The fn parameter can be a function or an object with a `<chain>`, or
a `chain<Chain>` method - which is a handy way to keep the value of `this`.

Functions listening for a given stage are run serially.

If a stage chain is already resolved, new listeners are just added immediately
to the promise chain.

To append a function at the end of the current chain, use:

- state.finish(fn)
  fn can return a promise.
  To avoid deadlocks, fn must not return calls to state history methods.

To stop further chain processing, use:

- state.stop()

Once stopped a chain cannot be restarted.

Chains are implemented through native DOM emitters and listeners, and the
emitter is either:

- `document.currentScript` when it exists and when the registered listener is a function. It has the advantage of recycling listeners when the corresponding node changes, for examples when loading a new document.
- `state.emitter`, in all other cases, which is bound to a specific state.
Note that `state.emitter` is kept when the referrer has same pathname, and
discarded otherwise.

### state

The state object describes components of the url parsed with Page.parse()

- state.pathname, state.query, state.hash
  see also Page.format(state)

**Important**: do not mutate those properties.
The state history methods accept partial objects.

- state.data
  the data must be JSON-serializable.

- state.ui
  object that changes when pathname changes.
  setup-patch-hash state changes share the same `state.ui`.

- state.referrer
  the previous parsable state.
  If Page is at first run, refers to the same location - without hash.
  Is not related to `document.referrer`.

- state.follower
  the following state.

Page.State: the state's constructor.

### Document import

When importing a document, two methods (that can return a promise) are called:

- state.mergeHead(head, prev)
- state.mergeBody(body, prev)

The default `mergeHead` method do DOM diffing to keep existing script and link
nodes.
The default `mergeBody` method just replaces `document.body` with the new body.

These methods can be overriden from `Page.init` or `Page.route`.

### Integration with Custom Elements

An object having `build`, `patch`, `setup`, `close` methods can be
plugged into Page using:

- state.connect(node)
- state.disconnect(node)

Both methods are also available directly as `Page.connect`, `Page.disconnect`.

Furthermore, if the object owns methods named `handle${Type}`, they will be
used as `type` event listeners on that object, receiving arguments `(e, state)`.

To use "capture" listeners, just name the methods `capture<Type>` (new in 7.1.0).

To use the same mecanism to manage event listener on another event emitter,
pass that event emitter as second argument to `state.connect(listener, emitter)`.

To simply handle or capture events on window,
use `handleAll${Type}` or `captureAll${Type}`.

These event listeners are automatically added during setup, and removed during
close (or disconnect).

```js
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
  state.finish(function() {
    // do something at the end of the setup chain
  });
}
close() {
  if (this.slider) this.slider.destroy();
  delete this.slider;
}
handleClick(e, state) {
  if (e.target.href) state.push(e.target.href);
}
handleAllClick(e, state) {
  // deactivate something activated on click
}
```

### Using the event listener on other objects (window, document...)

- state.connect(listener, emitter)

This method accepts a second argument to configure event listeners, and
benefit from automatic removal of event listeners on `close`.

Example:

```js
setup(state) {
  state.connect(this, window);
}
handleScroll(e, state) {
  // got click
}
```

### Loading of scripts and stylesheets

When importing a document, scripts (and link imports, though it's deprecated)
are executed in order, and stylesheets are inserted all at once.

Preloading is done using XHR for same-origin scripts and stylesheets, otherwise
no preloading is done (due to limitations of cross origin requests).

### History

These methods will run chains on new state and return a promise:

- state.push(location or url, opts)
- state.replace(location or url, opts)

Options:

- vary (boolean, or "build", "patch", "hash", default false)
  Overrides how pathname, query, hash are compared to previous state.
  `true` re-routes the page; and varying on a chain runs the next chains too.
  Example: reload after a form login.

- data
  Assign this data to next state.data.

- state.reload(opts)
  a shortcut for `state.replace(state, opts)`,
  with the correct value for `vary` set depending on state chains being
  used or not.
  `opts.vary` can be set, in which case it is passed as is to `replace`.
  Example: does not call `setup` then `close` unless BUILD chain is not empty.

The chains are run depending on how the url changes:

- pathname: runs `route`, then runs build chain on new state
- query: runs patch chain on new state
- hash: runs hash chain on new state

The `close` chain is run on current state, after the new state has finished
(to allow proper management of page transitions).

Chains `init` and `ready` are always run.

Chain `setup` is only run if the document is visible (not prerendering, not hidden).

Internal errors are caught and replaced by calls to document.location's
assign or replace methods accordingly.

The error chain can be used to remove `state.error` and continue on with
normal behavior.

A convenient method only that only replaces current window.history entry:

- state.save()
  useful to save current state.data.

### Tools

- Page.get(url, statusRejects)
  statusRejects defaults to 400.
  Fetch the url and return a string as promised.

- Page.createDoc(str)
  returns an HTML document from a string.

- Page.parse(url)
  parses a url into pathname, query object, hash; and protocol, hostname, port
  if not the same domain as the document.

- Page.format(obj)
  format a parsed url to a string with only what was defined,
  converts obj.path to pathname, query then stringify query obj if any.

- Page.sameDomain(a, b)
  compare domains (protocol + hostname + port) of two url or objects.

- Page.samePathname(a, b)
  compare domains and pathname of two url or objects.

- Page.sameQuery(a, b)
  compare query strings of two url or objects.

- Page.samePath(a, b)
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

## Install

Manual installation is simple:

```bash
npm install window-page
ln -s node_modules/window-page/window-page.js public/js/
```

then add a script tag in a web page, before the application scripts that
use the chain methods.

window-page is also a commonjs module, so it can be used with `require`.

## Debug log

Either set `window.debug` to a custom log function, add set local storage:
`window.localStorage.setItem('debug', 'window-page')`.

## License

MIT, see LICENSE file.
