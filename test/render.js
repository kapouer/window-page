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
				if (opts.idle) page.run(opts.idle, function(err, str) {
					if (err) reject(err);
					else resolve(str);
				});
				else setTimeout(function() {
					page.html().then(resolve).finally(() => page.unload());
				}, opts.delay);
			})
			.catch(reject);
			page.load(url, settings);
		});
	});
}

var host = "http://localhost";

describe("Rendering", function suite() {
	this.timeout(3000);
	var server, port;
	var server2, port2;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.use(function(req, res, next) {
			if (req.query.delay) setTimeout(next, parseInt(req.query.delay) * 1000);
			else next();
		});
		app.get(/\.(json|js|css|png|templates)$/, express.static(app.get('views')));
		app.get(/\/templates\/.+\.html$/, express.static(app.get('views')));
		app.get(/\.html$/, dom().load({plugins: loadPlugins}));

		server2 = app.listen(function(err) {
			if (err) console.error(err);
			port2 = server2.address().port;
		});
		server = app.listen(function(err) {
			if (err) console.error(err);
			port = server.address().port;
			done();
		});
	});

	after(function(done) {
		server.close();
		server2.close();
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
					Page.setup(function(state) {
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

	it("should support setup twice for same function", function() {
		return Render(host + ':' + port + '/templates/early-setup.html').then(function(body) {
			expect(body).to.contain('data-prerender="true"');
			expect(body).to.contain('<div class="testA">2</div>');
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

	it("should run state and queue a reload", function() {
		return Render(host + ':' + port + '/templates/queue-reload.html', {
			delay: 250
		}).then(function(body) {
			expect(body).to.contain('Sampleaa');
		});
	});

	it("should set a router and run it and next page, and on previous page", function() {
		return Render(host + ':' + port + '/templates/route-spa.html', {
			idle: function(cb) {
				cb(null, window.test1 + window.test2);
			}
		}).then(function(str) {
			expect(str.replace(/[\n\t]+/g, '')).to.equal(`
<html lang="en" data-prerender="true"><head>
	<title>first</title>
	<script src="/spa.js"></script>
</head>
<body>first
</body></html>
<html lang="fr" data-removed="true" data-prerender="true"><head>
	<title>two</title>
	<script src="/spa.js"></script>
</head>
<body>two
</body></html>`.replace(/[\n\t]+/g, ''));
		});
	});

	it("should connect custom element and keep handler across patch nav", function() {
		return Render(host + ':' + port + '/templates/custom-elements.html', {
			delay: 1000
		}).then(function(body) {
			expect(body).to.contain('data-query-test="4"');
			expect(body).to.contain('data-clicks="5"');
			expect(body).to.contain('?test=6');
		});
	});

	it("should connect custom element and close it after pathname nav and its setup", function() {
		return Render(host + ':' + port + '/templates/custom-elements-close.html', {
			delay: 1000
		}).then(function(body) {
			expect(body).to.contain('data-setup="2"');
			expect(body).to.contain('data-close="1"');
		});
	});

	it("should reload current document and not run inline scripts handlers during import", function() {
		return Render(host + ':' + port + '/templates/reload-setup.html', {
			delay: 1000
		}).then(function(body) {
			expect(body).to.contain('data-setups="2"');
			expect(body).to.contain('data-closes="1"');
		});
	});

	it("should connect custom element and survive a reload without document import", function() {
		return Render(host + ':' + port + '/templates/custom-elements-reload.html', {
			delay: 1000
		}).then(function(body) {
			expect(body).to.contain('data-clicks="2"');
		});
	});

	it("should connect custom element and not run chains if element is disconnected at once", function() {
		return Render(host + ':' + port + '/templates/custom-elements-disconnect.html', {
			delay: 1000
		}).then(function(body) {
			expect(body).to.contain('data-setups="0"');
		});
	});

	it("should wait for external stylesheet to be loaded", function(done) {
		this.timeout(4000);
		request({
			method: 'GET',
			url: host + ':' + port + '/external-stylesheet.html?port=' + port2
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body).to.contain('<div class="status">squared</div>');
			done();
		});
	});

	it("should patch then setup then patch with same state.data, then build with new state.data", function() {
		return Render(host + ':' + port + '/templates/data.html', {
			delay: 250
		}).then(function(body) {
			expect(body).to.contain('data-builds="-1-1"');
			expect(body).to.contain('data-patches="-1-2-1"');
		});
	});

	it("should wait for patch chain to finish, load remote script during patch, run a patch in that script before the chain finished", function() {
		return Render(host + ':' + port + '/templates/patch-load-patch-finish.html', {
			delay: 0
		}).then(function(body) {
			expect(body).to.contain('data-finished="yes"');
		});
	});

	it("should run listener after an empty chain has been run", function() {
		return Render(host + ':' + port + '/templates/chain-empty.html', {
			delay: 250
		}).then(function(body) {
			expect(body).to.contain('data-consent="run"');
		});
	});

	it("should setup -> connect -> setup -> connect scroll event", function() {
		return Render(host + ':' + port + '/templates/custom-elements-connect-scroll.html', {
			delay: 250
		}).then(function(body) {
			expect(body).to.contain('data-scrolled="yes"');
		});
	});
});

