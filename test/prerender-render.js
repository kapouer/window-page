if (process.env.WEBDRIVER_SERVER) {
	console.info("Running only selenium tests, skipping this one");
	return;
}

var expect = require('expect.js');
var request = require('request');
var express = require('express');
var dom = require('express-dom');

dom.settings.stall = 5000;
dom.settings.allow = 'all';
dom.settings.timeout = 10000;
dom.settings.console = true;

var renderPlugins = [
	dom.plugins.redirect,
	dom.plugins.referrer,
	dom.plugins.html
];

var host = "http://localhost";


describe("Two-phase rendering", function suite() {
	this.timeout(3000);
	var server, port;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.get(/\.(json|js|css|png|templates)$/, express.static(app.get('views')));
		app.get(/\/templates\/.+\.html$/, express.static(app.get('views')));
		app.get(/\.html$/, dom().load());

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
			expect(body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="setup"></div>')).to.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
				expect(state.body.indexOf('<div class="setup">0</div>')).to.be.greaterThan(0);
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
			expect(body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="patch">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="setup"></div>')).to.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
				expect(state.body.indexOf('<div class="patch">0</div>')).to.be.greaterThan(0);
				expect(state.body.indexOf('<div class="setup">0</div>')).to.be.greaterThan(0);
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
			expect(body.indexOf('data-page-stage="2"')).to.be.greaterThan(0);
			expect(body.indexOf("I'm built0")).to.be.greaterThan(0);
			expect(body.indexOf("your body0")).to.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
				expect(state.body.indexOf("I'm setup0")).to.be.greaterThan(0);
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
			expect(body.indexOf('<div class="status">hidden0</div>')).to.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf('<div class="status">squared0</div>')).to.be.greaterThan(0);
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
			expect(body.indexOf('<div class="status">squared</div>')).to.not.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf('<div class="status">squared</div>')).to.be.greaterThan(0);
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

});

