Changelog
=========

1.1.0
-----

This release fixes important bugs when importing documents, to the point it
might affect current code base if it had to write workarounds.

* a test suite !
* improve document import (after route) to match browser ordering of loading js/css.
* documentElement attributes are no longer removed when importing a document after `route`

3.0.0
-----

Moves to query-string@6 and targets modern browsers.

4.0.0
-----

* page events are no longer emitted globally
* event tracking is done on document, not on document.body
* new chain: init. Always called on each chain run.
* instead of managing chains, events are run using native event listeners on
scripts or on a per-page emitter.
* in event listeners, `e.state` is deprecated in favor of `e.details` which
has the same value.
* new: Page.unroute, unbuild, unsetup, unpatch... can unregister listeners.
* page-data-state is now a string, which makes it easier to understand
* Page.createDoc(str) to build a document out of a string

5.0.0
-----

* Page.state, Page.referrer are no longer available, use chains to access state,
and state.referrer.
* Page.route(fn) is not a chain, it justs sets the router.
* READY chain when document is ready after first load or after import.
* Page history methods have all matching state methods, which are more natural.

6.0.0
-----

* better integration with custom elements
* use actual dom nodes to track events across page loads
* finally method

7.0.0
-----

state.push, state.replace, state.reload default to document.location assign or
replace in case of non-recuperable errors.

7.4.0
-----

State chains are always resolved now: before they could hang on waiting for
document to become visible, which would prevent prerendering "internal redirections".
Consequently, when multiple states are pushed, only the last one runs its setup
chain, and only the first one its close chain.

7.5.0
-----

* opts.vary can be "build", "patch", "hash".
* when patch chain is empty, stop assuming user meant the build chain
  this can be a breaking change if the user assumed it as well, however it was not
  documented.

8.0.0
-----

Breaking change:
now we're using URL and URLSearchParams instead of URLUtils through an anchor.
it's not that bad because most browsers have it.
Bundle polyfills or use [polyfill.io](https://polyfill.io) otherwise.

A side effect of this is that a query string of the form `?a&b`
becomes `?a=&b=` after parsing/serializing, which means one cannot rely on
the difference between `null` and `''` (empty string) in the query parameters.
On the other hand relying on that difference was bad practice.

9.0.0
-----

Breaking change:
window, document event listeners are no longer tracker.
Please use `Page.connect(listener, window)` instead.

10.0.0
------

Breaking change:
state.referrer is not related to document.referrer.

11.0.0
------

Breaking change:
Referrer's CLOSE chain is called before current SETUP chain.

12.0.0
------

Breaking change:
Written in ECMAScript 6.

Several properties/methods are now private.

12.1.0
------

When using push/replace, latest state is used instead of
the actual state push was called from.

13.0.0
------

State inherits from Loc.

`Page.same...(a, b)` functions are replaced by `a.same...(b)`.

`state.toString()` gives back current url.

Default router can be restored using `Page.route()`.

14.0.0
------

* Loc inherits from URL.
* a shallow copy of state is made for each chain, in particular, state.stage is constant in a chain, and state url properties cannot be changed between to chains (it can be changed only by a new run, using push/replace).
* state.hash is now empty or starts with a '#', to align with URL behavior
* the "hash" chain is now called the "focus" chain - because state[stage] can be called directly instead of through Page[stage]. That doesn't mean "focus" actually focuses an element.
* now Page is actually the current state.
* state.stop no longer exists
* the "error" chain is now called the "catch" chain - same reason, state.error can be modified by listeners in the catch chain, so the rename is to avoid conflict.

14.1.0
------

* state[chainLabel] can be called without listener, it will resolve to that state.

15.0.0
------

* route is now a chain.
  Route listeners need to set `state.doc` to import a document

* after route (and import of new doc), just before ready chain, `state.doc` is set to `document`.

* init chain is removed. Use ready instead.

* There is no longer a default router
  See `test/public/tools.js` for examples.

* State.Stages, Stage.NodeEvents are exported

15.1.0
------

* state.push and replace return immediately

15.2.0
------

* More explicit emitter handling for functions, objects, dom nodes.

15.3.0
------

* Fix initialization of chains
* Do not allow patch chain to run through when not eligible

15.4.0
------

* Fix referrer chains emitters

16.0.0
------

Fixes that break previous behaviors:

* connect must call setup once even if element is added during patch,
  and on same pathname, but not if uiQueue is not run.
* disconnect must call close once, same thing.

16.1.0
------

* state.referrer is now null on first state

17.0.0
------

* the `focus` chain is renamed `fragment` to avoid method collision with custom elements.

18.0.0
------

Referrer properties are no longer copied to the new state.
This behavior wasn't documented, and is safer to implement on the user side.

18.2.0
------

Revert change in 18.1.0. Be more careful about the state received by listeners.

19.0.0
------

Breaking change: always close referrer before setup current state.

Fix double calls for connected elements and stop monkey-patching their methods.
