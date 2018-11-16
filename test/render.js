if (process.env.WEBDRIVER) {
	console.info("Running only selenium tests, skipping this one");
	return;
}

var expect = require('expect.js');
var request = require('request');
var express = require('express');

var dom = require('express-dom');
var Web = require('webkitgtk');

dom.settings.stall = 5000;
dom.settings.allow = 'all';
dom.settings.timeout = 10000;
dom.settings.stallTimeout = 1000;
dom.settings.console = true;

var loadPlugins = [
	debugPlugin,
	dom.plugins.redirect,
	dom.plugins.referrer,
	dom.plugins.html
];

function debugPlugin(page, settings) {
	if (process.env.DEBUG) {
		if (!settings.scripts) settings.scripts = [];
		settings.scripts.push(function(n) {
			window.debug = console.error.bind(console);
		});
	}
}

function Render(url, opts) {
	if (!opts) opts = {};
	return new Promise(function(resolve, reject) {
		Web(function(err, page) {
			var settings = {
				stallTimeout: 1000,
				console: true,
				navigation: true
			};
			debugPlugin(page, settings);

			page.when('ready', function() {
				if (opts.ready) page.run(opts.ready);
			});
			page.when('idle', function() {
				setTimeout(function() {
					page.html().then(resolve);
				}, opts.delay);
			}).catch(reject);
			page.load(url, settings);
		});
	});
}

var host = "http://localhost";

describe("Rendering", function suite() {
	this.timeout(3000);
	var server, port;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.get(/\.(json|js|css|png|templates)$/, express.static(app.get('views')));
		app.get(/\/templates\/.+\.html$/, express.static(app.get('views')));
		app.get(/\.html$/, dom().load({plugins: loadPlugins}));


		server = app.listen(function(err) {
			if (err) console.error(err);
			port = server.address().port;
			done();
		});
	});

	after(function(done) {
		server.close();
		done();
	});


	it("should run build and setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/build.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="setup">1</div>');
			done();
		});
	});

	it("should run build and patch and setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/patch.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="patch">1</div>');
			expect(body).to.contain('<div class="setup">1</div>');
			done();
		});
	});

	it("should run build and patch and setup, call replace and run patch again", function() {
		return Render(host + ':' + port + '/templates/replace.html', {delay: 150}).then(function(body) {
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="patch">2</div>');
			expect(body).to.contain('<div class="setup">1</div>');
			expect(body).to.contain('<div class="url">/templates/replace.html?toto=1</div>');
		});
	});

	it("should run build and patch and setup, call push and run patch again", function() {
		return Render(host + ':' + port + '/templates/push.html', {delay: 150}).then(function(body) {
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="patch">3</div>');
			expect(body).to.contain('<div class="setup">1</div>');
			expect(body).to.contain('<div class="url">/templates/push.html?toto=2</div>');
			expect(body).to.contain('<div class="location">/templates/push.html?toto=2</div>');
		});
	});

	it("should run route and build and setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=build'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="build">0</div>');
			expect(body).to.contain('<div class="setup">0</div>');
			done();
		});
	});


	it("should run route and imports", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=import'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain("I'm setup0");
			expect(body).to.contain("your body0");
			done();
		});
	});

	it("should render doc with stylesheet and script", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/order-stylesheets-scripts.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('<div class="status">squared</div>');
			done();
		});
	});

	it("should load stylesheet before remote script when rendering", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=order-stylesheets-scripts'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="status">squared</div>');
			done();
		});
	});

	it("should run route and load script before import", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=import-depending-on-script'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain("I'm setup0");
			expect(body).to.contain("your body770");
			done();
		});
	});

	it("should run build and patch then setup then back then build", function() {
		return Render(host + ':' + port + '/templates/back-build.html', {
			ready: function(cb) {
				window.testcb = cb;
				try {
					var script = document.createElement('script');
					script.textContent = `
					Page.route(function(state) {
						if (state.pathname == "/inexistent.html") setTimeout(function() {
							window.simClick();
							window.testcb();
						}, 250);
					});`;
					document.head.appendChild(script);
				} catch(ex) {
					console.error(ex);
				}
			}
		}).then(function(body) {
			expect(body).to.contain('<div class="build">2</div>');
			expect(body).to.contain('<div class="close">1</div>');
			expect(body).to.contain('<div class="setup">2</div>');
			expect(body).to.contain('<div id="click">1</div>');
			expect(body).to.contain('<div id="secondSetup">ok</div>');
		});
	});

	it("should parse state.hash and run hash chain on click", function() {
		return Render(host + ':' + port + '/templates/hash-click.html#test').then(function(body) {
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="hash">test</div>');
			expect(body).to.contain('<div class="secondhash">toto</div>');
		});
	});

	it("should run hash chain on push", function() {
		return Render(host + ':' + port + '/templates/hash-push.html').then(function(body) {
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="hash">test</div>');
		});
	});

	it("should allow early setup on state.emitter but not twice for same function", function() {
		return Render(host + ':' + port + '/templates/early-setup.html').then(function(body) {
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="testA">1</div>');
			expect(body).to.contain('<div class="testB">1</div>');
		});
	});

	it("should route setup and close and reload", function() {
		return Render(host + ':' + port + '/templates/reload.html?template=reload-helper', {
			delay: 250
		}).then(function(body) {
			expect(body).to.contain('data-setup="2"');
			expect(body).to.contain('data-close="1"');
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div id="reload">reloaded</div>');
		});
	});
});

