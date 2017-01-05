var expect = require('expect.js');
var request = require('request');
var express = require('express');

var host = "http://localhost";
var dom = require('express-dom');

dom.settings.stall = 5000;
dom.settings.allow = 'all';
dom.settings.timeout = 10000;
dom.settings.console = true;

var renderPlugins = [
	dom.plugins.hide,
	dom.plugins.nomedia,
	dom.plugins.redirect,
	dom.plugins.referrer,
	dom.plugins.html
];

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
			expect(body.indexOf("I'm built")).to.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf("I'm setup")).to.be.greaterThan(0);
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
			expect(body.indexOf("I'm built0")).to.be.greaterThan(0);
			expect(body.indexOf("your body0")).to.be.greaterThan(0);
			dom(body).load({
				plugins: renderPlugins
			})(res.request.uri.href).then(function(state) {
				expect(state.body.indexOf("I'm setup")).to.be.greaterThan(0);
				done();
			}).catch(function(err) {
				done(err);
			});
		});
	});

});

