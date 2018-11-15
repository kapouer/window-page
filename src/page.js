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
var queuedState;

W.run = function(state) {
	if (!state) state = Loc.parse();
	state.init(W);
	if (queue) {
		if (queuedState && queuedState.abort()) {
			debug("aborting current run");
		} else {
			debug("queueing");
			return queue.then(function() {
				return W.run(state);
			});
		}
	}
	queuedState = state;
	queue = state.run(W).then(function() {
		queue = null;
		queuedState = null;
		return state;
	});
	return queue;
};

W.router = function(state) {
	var refer = state.referrer;
	if (!refer.stage || state.host == refer.host && state.pathname == refer.pathname) {
		debug("Default router not running");
		return;
	}
	var url = Loc.format(state);
	return Utils.get(url, 500).then(function(client) {
		var doc = Utils.createDoc(client.responseText);
		if (client.status >= 400 && (!doc.body || doc.body.children.length == 0)) {
			throw new Error(client.statusText);
		} else if (!doc) {
			setTimeout(function() {
				document.location = url;
			}, 500);
			throw new Error("Cannot load remote document - redirecting...");
		}
		return doc;
	});
};

W.route = function(fn) {
	W.router = fn;
};

W.reload = function(state) {
	debug("reload");
	// copy state
	var prev = Loc.parse(state);
	// previous state must be closed but path comparisons must fail
	// so set a state at previous stage without location
	delete prev.pathname;
	delete prev.query;
	delete prev.hash;
	prev.stage = state.stage;
	state.referrer = prev;
	return W.run(state);
};

W.push = function(loc, state) {
	return historyMethod('push', loc, state);
};

W.replace = function(loc, state) {
	return historyMethod('replace', loc, state);
};

W.save = function(state) {
	return historySave('replace', state);
};

function historySave(method, state) {
	if (!supportsHistory) return false;
	var to = stateTo(state);
	window.history[method + 'State'](to, document.title, to.href);
	return true;
}

function historyMethod(method, loc, state) {
	if (!state) throw new Error("Missing state parameter");
	var copy = Loc.parse(Loc.format(loc));
	if (state.data != null) copy.data = state.data;
	copy.stage = state.stage;
	if (!Loc.sameDomain(state, copy)) {
		// eslint-disable-next-line no-console
		if (method == "replace") console.info("Cannot replace to a different origin");
		document.location = Loc.format(copy);
		return P();
	}
	debug("run", method, copy);
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

