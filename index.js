import { createDoc, get } from './src/utils';
import Loc from './src/loc';
import State from './src/state';

const W = {
	Loc, State, createDoc, get,
	parse(s) {
		return new Loc(s);
	},
	format(o) {
		if (!(o instanceof Loc)) {
			o = new Loc(o);
		}
		return o.toString();
	}
};

if (!window.Page) {
	window.Page = W;
	State.state.run().then(state => {
		if (!window.history.state) state.save();
	});
}

export default W;
