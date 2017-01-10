if (!process.env.SAUCE_USERNAME) {
	console.info("No SAUCE_USERNAME, skipping this test");
	return;
}

var expect = require('expect.js');
var express = require('express');
var webdriver = require("selenium-webdriver");

var host = "http://localhost";

function getBrowser() {
	var browser;
	var prefs = new webdriver.logging.Preferences();
	prefs.setLevel(webdriver.logging.Type.BROWSER, webdriver.logging.Level.DEBUG);
	return new webdriver.Builder()
	.usingServer('http://'+ process.env.SAUCE_USERNAME+':'+process.env.SAUCE_ACCESS_KEY+'@ondemand.saucelabs.com:80/wd/hub')
	.withCapabilities({
		browserName: process.env.WEBDRIVER_BROWSER_NAME || 'chrome',
		version: process.env.WEBDRIVER_BROWSER_VERSION || '',
		'tunnel-identifier': process.env.TRAVIS_JOB_NUMBER,
		build: process.env.TRAVIS_BUILD_NUMBER,
		username: process.env.SAUCE_USERNAME,
		accessKey: process.env.SAUCE_ACCESS_KEY
	})
	.setLoggingPrefs(prefs)
	.build();
}

function testPageForStrings(browser, url, strings) {
	return browser.get(url).then(function() {
		return browser.sleep(500).then(function() {
			return browser.getPageSource();
		}).then(function(html) {
			strings.forEach(function(str) {
				expect(html.indexOf(str)).to.be.greaterThan(0);
			});
		});
	});
}

describe("Rendering", function suite() {
	this.timeout(180000); // some browser VM can be slow
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

