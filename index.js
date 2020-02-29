var Utils = require('./src/utils');
var Loc = require('./src/loc');
var State = require('./src/state');
var Wait = require('./src/wait');

if (!window.Page) {
	var W = State.Page = window.Page = {
		State: State,
		Wait: Wait
	};

	Object.assign(W, Loc);
	W.createDoc = Utils.createDoc;
	W.get = Utils.get;

	W.route = function(fn) {
		State.prototype.router = function() {
			return fn(this);
		};
	};

	Loc.parse().run().then(function(state) {
		if (!window.history.state) state.save();
	});
}
