var expect = require('expect.js');
var express = require('express');

var host = "http://localhost";
var webdriver = require("selenium-webdriver");
var until = webdriver.until;
var By = webdriver.By;

function getBrowser() {
	var browser;
	if (process.env.SAUCE_USERNAME != undefined) {
		browser = new webdriver.Builder()
		.usingServer('http://'+ process.env.SAUCE_USERNAME+':'+process.env.SAUCE_ACCESS_KEY+'@ondemand.saucelabs.com:80/wd/hub')
		.withCapabilities({
			browserName: "chrome",
			'tunnel-identifier': process.env.TRAVIS_JOB_NUMBER,
			build: process.env.TRAVIS_BUILD_NUMBER,
			username: process.env.SAUCE_USERNAME,
			accessKey: process.env.SAUCE_ACCESS_KEY
		}).build();
	} else {
		browser = new webdriver.Builder().build();
	}
	return browser;
}

describe("Rendering", function suite() {
	this.timeout(3000);
	var server, base;

	before(function(done) {
		var app = express();
		app.set('views', __dirname + '/public');
		app.get('*', express.static(app.get('views')));


		server = app.listen(function(err) {
			if (err) console.error(err);
			base = host + ':' + server.address().port;
			done();
		});
	});

	after(function(done) {
		server.close();
		done();
	});

	beforeEach(function() {
		this.browser = getBrowser();
	});

	afterEach(function() {
		this.browser.quit();
	});




	it("should run build and setup", function() {
		var browser = this.browser;
		return browser.get(base + '/build.html').then(function() {
			return browser.wait(until.elementTextIs(By.css('body'), "I'm setup0"), 1000);
		});
		// expect(body.indexOf('data-page-stage="3"')).to.be.greaterThan(0);
	});


});

