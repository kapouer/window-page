const Utils = require('./src/utils');
const Loc = require('./src/loc');
const State = require('./src/state');
const Wait = require('./src/wait');

const W = module.exports = { Loc, State, Wait };

W.parse = (s) => new Loc(s);
W.format = (o) => o instanceof Loc ? o.toString() : new Loc(o).toString();

W.createDoc = Utils.createDoc;
W.get = Utils.get;

if (!window.Page) {
	new State().run().then(function (state) {
		if (!window.history.state) state.save();
	});
}
