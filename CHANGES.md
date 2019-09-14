1.1.0
=====

This release fixes important bugs when importing documents, to the point it
might affect current code base if it had to write workarounds.

* a test suite !
* improve document import (after route) to match browser ordering of loading js/css.
* documentElement attributes are no longer removed when importing a document after `route`

3.0.0
=====

Moves to query-string@6 and targets modern browsers.


4.0.0
=====

- page events are no longer emitted globally
- event tracking is done on document, not on document.body
- new chain: init. Always called on each chain run.
- instead of managing chains, events are run using native event listeners on
scripts or on a per-page emitter.
- in event listeners, `e.state` is deprecated in favor of `e.details` which 
has the same value.
- new: Page.unroute, unbuild, unsetup, unpatch... can unregister listeners.
- page-data-state is now a string, which makes it easier to understand
- Page.createDoc(str) to build a document out of a string

5.0.0
=====

- Page.state, Page.referrer are no longer available, use chains to access state,
and state.referrer.
- Page.route(fn) is not a chain, it justs sets the router.
- READY chain when document is ready after first load or after import.
- Page history methods have all matching state methods, which are more natural.

6.0.0
=====

- better integration with custom elements
- use actual dom nodes to track events across page loads
- finally method

7.0.0
=====

state.push, state.replace, state.reload default to document.location assign or
replace in case of non-recuperable errors.

7.4.0
=====

State chains are always resolved now: before they could hang on waiting for
document to become visible, which would prevent prerendering "internal redirections".
Consequently, when multiple states are pushed, only the last one runs its setup
chain, and only the first one its close chain.

7.5.0
=====

- opts.vary can be "build", "patch", "hash".
- when patch chain is empty, stop assuming user meant the build chain
  this can be a breaking change if the user assumed it as well, however it was not
  documented.

8.0.0
=====

Breaking change:
now we're using URL and URLSearchParams instead of URLUtils through an anchor.
it's not that bad because most browsers have it.
Bundle polyfills or use https://polyfill.io otherwise.

A side effect of this is that a query string of the form `?a&b`
becomes `?a=&b=` after parsing/serializing, which means one cannot rely on
the difference between `null` and `''` (empty string) in the query parameters.
On the other hand relying on that difference was bad practice.

