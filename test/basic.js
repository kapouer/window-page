var expect = require('expect.js');
var request = require('request');
var express = require('express');

var host = "http://localhost";
var dom = require('express-dom');

dom.settings.stall = 5000;
dom.settings.allow = 'all';
dom.settings.timeout = 10000;
dom.settings.console = true;

describe("Build phase", function suite() {
	this.timeout(3000);
	var server, port;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.get(/\.(json|js|css|png)$/, express.static(app.get('views')));
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


	it("should load a simple Html page", function(done) {
		request({
			method: 'GET',
			url: host + ':' + port + '/sample.html'
		}, function(err, res, body) {
			expect(res.statusCode).to.be(200);
			expect(body.indexOf("I'm built")).to.be.greaterThan(0);
			done();
		});
	});



});

