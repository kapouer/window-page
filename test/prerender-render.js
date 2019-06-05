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
dom.settings.console = true;

var renderPlugins = [
	debugPlugin,
	dom.plugins.redirect,
	dom.plugins.referrer,
	dom.plugins.html
];

function debugPlugin(page, settings, req) {
	if (!settings.scripts) settings.scripts = [];
	if (process.env.DEBUG) {
		if (req) {
			settings.scripts.push(function(n) {
				window.debug = console.error.bind(console, '*');
			});
		} else {
			settings.scripts.push(function(n) {
				window.debug = console.error.bind(console);
			});
		}
	} else {
		settings.scripts.push(function(n) {
			window.debug = function() {};
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


describe("Two-phase rendering", function suite() {
	this.timeout(3000);
	var server, port;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.get(/\.(json|js|css|png|templates)$/, express.static(app.get('views')));
		app.get(/\/templates\/.+\.html$/, express.static(app.get('views')));
		app.get(/\.html$/, dom().load(debugPlugin));

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

	it("should run build then setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/build.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="init">1</div>');
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="setup"></div>');
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body).to.contain('<div class="init">2</div>');
				expect(state.body).to.contain('<div class="build">1</div>');
				expect(state.body).to.contain('<div class="setup">1</div>');
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

	it("should run build and patch then setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/patch.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="patch">1</div>');
			expect(body).to.contain('<div class="setup"></div>');
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body).to.contain('<div class="build">1</div>');
				expect(state.body).to.contain('<div class="patch">1</div>');
				expect(state.body).to.contain('<div class="setup">1</div>');
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

	it("should run route and imports", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=import'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain("I'm built0");
			expect(body).to.contain("your body0");
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body).to.contain("I'm setup0");
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

	it("should load stylesheet when rendering", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=stylesheets'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('<div class="status">hidden0</div>');
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body).to.contain('<div class="status">squared0</div>');
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

	it("should load stylesheet before inline script when rendering", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=order-stylesheets'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.not.contain('<div class="status">squared</div>');
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body).to.contain('<div class="status">squared</div>');
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

	it("should run build and patch then setup then patch", function(done) {
		Web.load(host + ':' + port + '/repatch.html', {
			stallTimeout: 100,
			console: true,
			navigation: true
		}).once('idle', function() {
			setTimeout(function() {
				this.html().then(function(body) {
					expect(body).to.contain('<div id="loc">/repatch.html?test=one</div>');
					expect(body).to.contain('<div class="build">1</div>');
					expect(body).to.contain('<div class="patch">2</div>');
					expect(body).to.contain('<div class="setup">1</div>');
					done();
				}).catch(function(err) {
					done(err);
				});
			}.bind(this), 500);
		});
	});

	it("should run build and patch then setup then patch then back then patch", function() {
		return Render(host + ':' + port + '/back-patch.html', {delay: 500}).then(function(body) {
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="patch">3</div>');
			expect(body).to.contain('<div class="setup">1</div>');
			expect(body).to.contain('<div id="loc">/back-patch.html?test=one</div>');
			expect(body).to.contain('<div id="back">/back-patch.html</div>');
		});
	});

	it("should run build then setup then hash", function() {
		return Render(host + ':' + port + '/hash.html#test', {delay: 500}).then(function(body) {
			expect(body).to.contain('<div class="build">1</div>');
			expect(body).to.contain('<div class="setup">1</div>');
			expect(body).to.contain('<div class="hash">1</div>');
			expect(body).to.contain('<div id="hash">test</div>');
		});
	});

	it("should run setup and finally", function() {
		return Render(host + ':' + port + '/setup.html', {delay: 1000}).then(function(body) {
			expect(body).to.contain('<div class="setup">1</div>');
			expect(body).to.contain('<div class="orders">setup,setup2,setup21-false,finally</div>');
		});
	});

	it("should run setup and finally, then setup then close", function() {
		return Render(host + ':' + port + '/setup.html?close', {delay: 1000}).then(function(body) {
			expect(body).to.contain('<div class="setup">2</div>');
			expect(body).to.contain('<div class="close">1</div>');
			expect(body).to.contain('<div class="orders">setup,setup2,setup21-true,setup,setup2,setup21-false,finally,close</div>');
		});
	});

	it("should route two pages forward, then two pages backward", function() {
		this.timeout(6000);
		return Render(host + ':' + port + '/nav-1.html', {delay: 2000}).then(function(body) {
			expect(body).to.contain('|/nav-1.html|/nav-2.html|/nav-3.html|/nav-2.html|/nav-1.html');
		});
	});

	it("should connect custom element and keep handler across patch nav", function() {
		this.timeout(6000);
		return Render(host + ':' + port + '/custom-elements.html', {
			delay: 1000
		}).then(function(body) {
			expect(body).to.contain('?test=6');
		});
	});
});

