var Utils = require('./utils');
var Loc = require('./loc');

var debug = Utils.debug;
var P = Utils.P;

var W = exports;
Object.assign(W, Loc);
W.createDoc = Utils.createDoc;
W.get = Utils.get;

var supportsHistory = false;
var queue;

W.stage = function(stage) {
	var root = document.documentElement;
	if (stage != null) root.setAttribute('data-page-stage', stage);
	else stage = root.dataset.pageStage;
	return stage;
};

W.run = function(state) {
	if (!state) state = Loc.parse();
	state.init(W);
	if (queue) {
		if (W.state && W.state.abort()) {
			debug("aborting current run");
		} else {
			debug("queueing");
			return queue.then(function() {
				return W.run(state);
			});
		}
	}
	queue = state.run(W).then(function() {
		queue = null;
		return state;
	});
	return queue;
};

W.reload = function() {
	// FIXME
	// reload implies starting again from a fresh page
	// but that might not be possible if the script from which routing was done has been removed
	// during navigation
	// interestingly, if we try to solve this by importing the original html,
	// we end up having to execute route after importDocument, not before...
	// if no route -> fetch then importDocument then maybe route if current stage is not INIT
	// if route -> no importDocument what so ever, must be called by route explicitely ???
	var state = Loc.parse(W.state);
	W.stage(state.initialStage);
	W.state = {stage: state.stage};
	state.stage = state.initialStage;
	return W.run(state);
};

W.push = function(newState, state) {
	return historyMethod('push', newState, state);
};

W.replace = function(newState, state) {
	return historyMethod('replace', newState, state);
};

W.save = function(state) {
	return historySave('replace', state || W.state);
};

function historySave(method, state) {
	if (!supportsHistory) return false;
	var to = stateTo(state);
	window.history[method + 'State'](to, document.title, to.href);
	return true;
}

function historyMethod(method, newState, state) {
	var url;
	if (typeof newState == "string") {
		url = newState;
		newState = {};
	} else {
		url = Loc.format(newState);
	}
	var copy = Loc.parse(url);
	if (newState.data != null) copy.data = newState.data;
	copy.stage = newState.stage;

	if (!state) state = W.state;
	if (!Loc.sameDomain(state, copy)) {
		// eslint-disable-next-line no-console
		if (method == "replace") console.info("Cannot replace to a different origin");
		debug("redirecting to", url);
		document.location = url;
		return P();
	}
	debug("run", method, state);
	return W.run(copy).then(function() {
		historySave(method, copy);
	});
}

function historyListener(e) {
	var state = stateFrom(e.state) || Loc.parse();
	debug("history event", e.type, state);
	W.run(state);
}

function stateTo(state) {
	return {
		href: Loc.format(state),
		data: state.data
	};
}

function stateFrom(from) {
	if (!from || !from.href) return;
	var state = Loc.parse(from.href);
	state.data = from.data || {};
	return state;
}

if (window.history) {
	supportsHistory = true;
	window.addEventListener('popstate', historyListener);
}

W.run().then(function(state) {
	if (!window.history.state) {
		historySave("replace", state);
	}
});

