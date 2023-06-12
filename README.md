# window.Page

Async chains for web page lifecycle.

Works well with:

- async navigation
- custom elements
- visibility API
- history API

`window.Page` is the current State instance.

## Install

This is a nodejs module.
It natively supports es6 modules, and provides a cjs bundle.

## Chains

- route: pathname changed and document is not prerendered; can set `state.doc`.
- ready: document is ready
- build: pathname changed and document is not prerendered
- patch: pathname changed and document is not prerendered, or query changed
- setup: visible, on first view or pathname changed
- paint: visible, on first view or pathname or query changed
- fragment: visible, location hash changed; `state.hash` is set.
- close: visible, after new state reach setup, referrer is closed
- catch: error was thrown, `state.error` is set.

A run is triggered by navigation (document.location changed in any way, or
page history methods called, see below).

Several chains are only run when document is visible - i.e. not "hidden".
This is used to prerender on server, and also prerender on client.

Route listeners can set `state.doc`: an optional document which styles and scripts are imported after `route` chain.
The `ready` chain always has `state.doc = document`.

If the `state.error` object is removed from state during the catch chain,
the navigation will continue as if the error did not happen.

## Usage

```js

Page.route(async function(state) {
 const res = await fetch(page.pathname + '.json');
 const data = await res.json();
 // keep data during navigation
 state.data = data;
 state.doc = state.parseDoc(data.template);
});

Page.connect({
  build(state) {
    // build page
  }
  async patch(state) {
    if (state.query.id == null) return;
    const data = await (fetch('/getdata?id=' + state.query.id).json())
    // do something
  }
  handleClick(e) {
    const link = e.target.closest('a[href]');
    if (!link) return;
    e.preventDefault();
    state.push(link.href);
  }
});

```

## API

### chains

For each chain, one can add or remove a listener function that receives the
current state as argument.

- `state[chainLabel](fn)`
  runs optional fn right now if the chain is reached, or wait the chain to be run.
  returns a promise that resolves to corresponding state.
- `state['un'+chainLabel](fn)`
  removes fn from a chain, mostly needed for custom elements.

The fn parameter can be a function or an object with a `<chain>`, or
a `chain<Chain>` method - which is a handy way to keep the value of `this`.

Functions listening for a given stage are run serially.

If a stage chain is already resolved, new listeners are just added immediately
to the promise chain.

To append a function at the end of the current chain, use:

- state.finish(fn)
  fn can return a promise.

Avoid making a chain wait its own end, or it will deadlock.

To run a custom chain:

- state.runChain(stage)

Note that custom chains do not propagate properties added to state to other chains.

### listeners and navigation

Chains are implemented through native DOM emitters and listeners, and the
emitter is either a script node in `document.head`, or a state-bound, out of tree, DOM node.

The script node can be `document.currentScript` when defined, unless the listener is a DOM node that is not itself a script node in document head.

Otherwise it is `state.emitter`. That emitter is shared between two successive states having the same pathname, and distinct otherwise.

These behaviors ensure that during navigation, a common script keeps its listeners registered, and other listeners will only be triggered during the life of the state that allowed them to be registered.

### state

The state is a subclass of Loc, which extends URL class with:

- query object
- sameDomain, samePathname, sameQuery, sameHash, samePath methods
- toString() returns a path when in the same domain

**Important**: use state.push/replace to mutate url properties.
The state history methods accept partial objects.

- state.data
  data is saved in navigator history - must be JSON-serializable.

- state.referrer
  the previous state, or null;
  Is not related to `document.referrer`.

Page.State: the state's constructor.

### Document import

When a new document is loaded after route chain, stylesheets are loaded in parallel, and scripts are loaded serially, with parallel preloading.

Those methods are called:

- await state.mergeHead(head, prev)
- await state.mergeBody(body, prev)

The default `mergeHead` method do a basic diff to keep existing scripts and links
nodes.
The default `mergeBody` method just replaces `document.body` with the new body.

To manage page transitions, these methods can be overriden by `route` listeners.

### Integration with Custom Elements, event handlers

An object having build, patch, setup, paint, fragment, close methods can be
plugged into Page using:

- state.connect(node)
- state.disconnect(node)

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
patch(state) {}
setup(state) {}
close() {}
captureSubmit(e, state) {}
handleClick(e, state) {}
handleAllClick(e, state) {}
```

### Emitting events with correct state

Use `state.dispatch(target, name)` to make sure the connected handlers get the right state parameter.

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

### History

These methods will run chains on new state and return immediately the new state:

- state.push(location or url, opts)
- state.replace(location or url, opts)

Options:

- vary (boolean, or "build", "patch", "fragment", default false)
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

A convenient method only that only replaces current window.history entry:

- state.save()
  useful to save current state.data.

### Loc methods

State inherits from Loc:

- parse(str)
  parses a url into pathname, query object, hash; and protocol, hostname, port
  if not the same domain as the document.
  returns a Loc instance.

- format(loc)
  format a location to a string with only what was defined,
  converts obj.path to pathname, query then stringify query obj if any.

- sameDomain(b)
  compare domains (protocol + hostname + port) of two url or objects.

- samePathname(b)
  compare domains and pathname of two url or objects.

- sameQuery(b)
  compare query strings of two url or objects.

- samePath(b)
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

[![Build Status](https://travis-ci.org/kapouer/window-page.svg?branch=master)](https://travis-ci.org/kapouer/window-page)
![BrowserStack Status](https://www.browserstack.com/automate/badge.svg?badge_key=MndLTXRsN2RKampOTGJEVmVVdmtONnhOTkxDV25KOXdGa0RnNTNWcTJUMD0tLU8xUWJJY0RqK2xpYzNQcUhxUEFIZGc9PQ==--6b7064ec4dca4fb4a26f955db807a43e32f2a2c3)

## Debug logs

Just enable `debug` level in the console.

## License

MIT, see LICENSE file.
