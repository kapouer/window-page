var Utils = require('./utils');
var Loc = require('./loc');

var debug = Utils.debug;
var P = Utils.P;

var W = exports;
Object.assign(W, Loc);
W.createDoc = Utils.createDoc;
W.get = Utils.get;

var queue;
var queuedState;

W.run = function(state) {
	if (!state) state = Loc.parse();
	debug("run", state.pathname, state.query);
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
	if (state.referrer && state.referrer.historyListener) {
		window.removeEventListener('popstate', state.referrer.historyListener);
	}
	state.historyListener = historyListener.bind(null, state);
	window.addEventListener('popstate', state.historyListener);
	queue = state.run(W).then(function() {
		queue = null;
		queuedState = null;
		return state;
	});
	return queue;
};

W.router = function(state) {
	var refer = state.referrer;
	if (!refer.prerender) {
		debug("Default router disabled after non-prerendered referrer");
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
	if (!window.history) return false;
	var to = stateTo(state);
	debug("history", method, to);
	window.history[method + 'State'](to, document.title, to.href);
	return true;
}

function historyMethod(method, loc, state) {
	if (!state) throw new Error("Missing state parameter");
	var copy = Loc.parse(Loc.format(loc));
	if (!Loc.sameDomain(state, copy)) {
		// eslint-disable-next-line no-console
		if (method == "replace") console.info("Cannot replace to a different origin");
		document.location = Loc.format(copy);
		return P();
	}
	if (state.data != null) copy.data = state.data;
	copy.prerender = state.prerender;
	copy.referrer = state;
	debug("run", method, copy);
	return W.run(copy).then(function() {
		historySave(method, copy);
	});
}

function historyListener(refer, e) {
	var state = stateFrom(e.state) || Loc.parse();
	debug("history event", e.type, e.state);
	state.referrer = refer;
	W.run(state);
}

function stateTo(state) {
	return {
		href: Loc.format(state),
		data: state.data,
		prerender: false,
		stage: state.stage
	};
}

function stateFrom(from) {
	if (!from || !from.href) return;
	var state = Loc.parse(from.href);
	delete from.href;
	Object.assign(state, from);
	return state;
}

W.run().then(function(state) {
	if (!window.history.state) {
		historySave("replace", state);
	}
});
