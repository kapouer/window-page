var Utils = require('./src/utils');
var Loc = require('./src/loc');

var W = window.Page = {};

Object.assign(W, Loc);
W.createDoc = Utils.createDoc;
W.get = Utils.get;
W.connect = Utils.connect;
W.disconnect = Utils.disconnect;

// shortcut
W.route = function(fn) {
	return W.init(function(state) {
		state.router = function() {
			return fn(state);
		};
	});
};

Loc.parse().run().then(function(state) {
	state.save();
});

