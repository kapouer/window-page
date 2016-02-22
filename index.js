function WindowPage(inst) {
	if (inst) {
		if (inst instanceof WindowPage) return inst;
		else if (inst.state) this.state = inst.state;
	}

	require('component-emitter')(this);
	var QueryString = require('query-string');

	this.location = new URL("", document.location);

	this.parse = function(str) {
		if (!str) str = document.location.search:
		return QueryString.parse(str);
	};
	this.stringify = function(obj) {
		return QueryString.stringify(obj);
	};

	this.builds = [];
	this.handles = [];

	this.historyListener = this.historyListener.bind(this);
	window.addEventListener('popstate', this.historyListener);

	this.readyListener = this.readyListener.bind(this);
	if (document.readyState == "interactive" || document.readyState == "complete") {
		this.readyListener();
	} else {
		document.addEventListener('DOMContentLoaded', this.readyListener);
	}
}

WindowPage.prototype.build = function(fn) {
	if (!fn) {
		this.builder = this.all("building", this.builds);
	} else {
		this.builds.push(fn);
		if (this.builder) this.builder = this.builder.then(fn);
	}
	return this;
};

WindowPage.prototype.handle = function(fn) {
	if (!fn) {
		this.handler = this.all("handling", this.handles);
	} else {
		this.handles.push(fn);
		if (this.handler) this.handler = this.handler.then(fn);
	}
	return this;
};

WindowPage.prototype.all = function(phase, list) {
	var p = Promise.resolve();
	list.forEach(function(fn) {
		p = p.then(fn);
	});
	p.catch(function(err) {
		if (this.listeners('error').length) {
			this.emit('error', err, phase);
		} else {
			console.error(phase, "error (default listener)", err);
		}
	}.bind(this));
	return p;
};

WindowPage.prototype.readyListener = function(e) {
	document.removeEventListener('DOMContentLoaded', this.readyListener);
	var root = document.documentElement;
	var stage = root.getAttribute('stage');

	if (!stage) {
		stage = 'build';
		root.setAttribute('stage', stage);
		this.build();
	} else if (stage == 'build') {
		this.builder = Promise.resolve();
	}

	var visible = document.documentElement.offsetWidth || document.documentElement.offsetHeight;

	if (stage != "ui" && visible) {
		this.builder.then(function() {
			root.setAttribute('stage', 'ui');
			if (window.WebComponents) {
				var wcListener = function() {
					window.removeEventListener('WebComponentsReady', wcListener);
					this.handle();
				}.bind(this);
				window.addEventListener('WebComponentsReady', wcListener);
			} else {
				this.handle();
			}
		}.bind(this));
	}
};

/*
 * types of browse events (if they were all caught, which they will at some point):
 * same href, changing hash, changing query, changing path, changing domain
 * in case of same href, it is ignored
 * changing hash or query should trigger a query event
 * changing path should trigger a destroy/creation phase
 * changing domain should allow dialog, target blank
 */
WindowPage.prototype.historyListener = function(e) {
	// would not make sense but happens on some browsers
	var nloc = new URL("", document.location);
	var tloc = this.location;
	if (nloc.href == tloc.href) return;
	this.location = nloc;
	if (nloc.host == tloc.host && nloc.pathname == tloc.pathname && nloc.search != tloc.search) {
		this.emit('query', this.query.parse(nloc.search));
	}
};

/*
 * useless for now, will be called when changing path in location is handled
 */
WindowPage.prototype.destroy = function() {
	window.removeEventListener('popstate', this.historyListener);
	this.off();
};

window.Page = new WindowPage(window.Page);

