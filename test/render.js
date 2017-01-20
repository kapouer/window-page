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

var loadPlugins = [
	dom.plugins.redirect,
	dom.plugins.referrer,
	dom.plugins.html
];

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
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="setup">0</div>')).to.be.greaterThan(0);
			done();
		});
	});

	it("should run build and patch and setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/patch.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="patch">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="setup">0</div>')).to.be.greaterThan(0);
			done();
		});
	});

	it("should run build and patch and setup, call replace and run patch again", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/replace.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="patch">1</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="setup">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="url">/replace.html?toto=1</div>')).to.be.greaterThan(0);
			done();
		});
	});

	it("should run build and patch and setup, call push and run patch again", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/push.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="build">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="patch">1</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="setup">0</div>')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="url">/push.html?toto=1</div>')).to.be.greaterThan(0);
			done();
		});
	});

	it("should run route and build and setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=build'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf("I'm setup0")).to.be.greaterThan(0);
			done();
		});
	});


	it("should run route and imports", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=import'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf("I'm setup0")).to.be.greaterThan(0);
			expect(body.indexOf("your body0")).to.be.greaterThan(0);
			done();
		});
	});

	it("should render doc with stylesheet and script", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/order-stylesheets-scripts.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('<div class="status">squared</div>')).to.be.greaterThan(0);
			done();
		});
	});

	it("should load stylesheet before remote script when rendering", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=order-stylesheets-scripts'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf('<div class="status">squared</div>')).to.be.greaterThan(0);
			done();
		});
	});

	it("should run route and load script before import", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=import-depending-on-script'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
			expect(body.indexOf("I'm setup0")).to.be.greaterThan(0);
			expect(body.indexOf("your body770")).to.be.greaterThan(0);
			done();
		});
	});
});

