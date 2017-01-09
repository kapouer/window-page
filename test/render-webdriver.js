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

function testPageForStrings(browser, url, strings) {
	return browser.get(url).then(function() {
		return browser.sleep(5000).then(function() {
			return browser.getPageSource();
		}).then(function(html) {
			strings.forEach(function(str) {
				expect(html.indexOf(str)).to.be.greaterThan(0);
			});
		});
	});
}

describe("Rendering", function suite() {
	this.timeout(15000);
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
		return testPageForStrings(this.browser, base + '/build.html', [
			'data-page-stage="3"',
			"I'm setup0"
		]);
	});

	it("should run route and build and setup", function() {
		return testPageForStrings(this.browser, base + '/route.html?template=build', [
			'data-page-stage="3"',
			"I'm setup0"
		]);
	});


	it("should run route and imports", function() {
		return testPageForStrings(this.browser, base + '/route.html?template=import', [
			'data-page-stage="3"',
			"I'm setup0",
			"your body0"
		]);
	});

	it("should render doc with stylesheet and script", function() {
		return testPageForStrings(this.browser, base + '/order-stylesheets-scripts.html', [
			'data-page-stage="3"',
			'<div class="status">squared</div>'
		]);
	});

	it("should load stylesheet before remote script when rendering", function() {
		return testPageForStrings(this.browser, base + '/route.html?template=order-stylesheets-scripts', [
			'data-page-stage="3"',
			'<div class="status">squared</div>'
		]);
	});
});

