import { createDoc, get } from './src/utils';
import Loc from './src/loc';
import State from './src/state';
import * as Wait from './src/wait';

export {
	Loc, State, Wait, createDoc, get
};
export function parse(s) {
	return new Loc(s);
}
export function format(o) {
	if (!(o instanceof Loc)) {
		o = new Loc(o);
	}
	return o.toString();
}

if (!window.Page) {
	new State().run().then(function (state) {
		if (!window.history.state) state.save();
	});
}
