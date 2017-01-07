var expect = require('expect.js');
var request = require('request');
var express = require('express');

var host = "http://localhost";
var dom = require('express-dom');

dom.settings.stall = 5000;
dom.settings.allow = 'all';
dom.settings.timeout = 10000;
dom.settings.console = true;

describe("Prerendering", function suite() {
	this.timeout(3000);
	var server, port;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.get(/\.(json|js|css|png)$/, express.static(app.get('views')));
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


	it("should run build but not setup", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/build.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf("I'm built0")).to.be.greaterThan(0);
			done();
		});
	});

	it("should run route and build", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=build'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf("I'm built0")).to.be.greaterThan(0);
			done();
		});
	});

	it("should store data, run route and build, and keep stored data", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/store.html?template=build'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf("I'm built0")).to.be.greaterThan(0);
			expect(body.indexOf('data-page-thing="1"')).to.be.greaterThan(0);
			done();
		});
	});

	it("should run route and imports", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=import'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf("I'm built0")).to.be.greaterThan(0);
			expect(body.indexOf("your body0")).to.be.greaterThan(0);
			done();
		});
	});

	it("should run route and load scripts in correct order", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=order-scripts'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf("ABBACCBAC")).to.be.greaterThan(0);
			done();
		});
	});

	it("should not load have stylesheets loaded by express-dom prerendering mode anyway", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/route.html?template=stylesheets'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf('<div class="status">squared0</div>')).to.not.be.greaterThan(0);
			done();
		});
	});

});

