const Utils = require('./src/utils');
const Loc = require('./src/loc');
const State = require('./src/state');
const Wait = require('./src/wait');

const W = module.exports = State.Page = {
	State: State,
	Wait: Wait
};

Object.assign(W, Loc);

W.createDoc = Utils.createDoc;
W.get = Utils.get;
W.route = function(fn) {
	State.prototype.router = function () {
		return fn(this);
	};
};

if (!window.Page) {
	new State(Loc.parse()).run().then(function (state) {
		if (!window.history.state) state.save();
	});
}
