import State from './src/state';

if (!window.Page) {
	State.state.run().then(state => {
		if (!window.history.state) state.save();
	});
}

export default State;
