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

- page events are emitted on document, not on window
- event tracking happens on document, not on body
- instead of managing chains, events are run using native event listeners
- in event listeners, `e.state` is deprecated in favor of `e.details` which 
has the same value.
- new: Page.unroute, unbuild, unsetup, unpatch... can unregister listeners.

