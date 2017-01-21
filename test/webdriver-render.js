if (!process.env.WEBDRIVER) {
	console.info("No WEBDRIVER, skipping this test");
	return;
}

var expect = require('expect.js');
var express = require('express');
var webdriver = require("selenium-webdriver");
var project = require('../package.json').name;
var getPort = require('gport');

var host = "http://localhost";

function getEnvCaps() {
	var envCaps = process.env.WEBDRIVER;
	if (!envCaps) return {};
	try {
		envCaps = eval('{' + envCaps + '}');
	} catch(ex) {
		console.error("Cannot use WEBDRIVER env caps", envCaps);
		return {};
	}
	return envCaps;
}

function getBrowser() {
	var browser;
	var prefs = new webdriver.logging.Preferences();
	prefs.setLevel(webdriver.logging.Type.BROWSER, webdriver.logging.Level.DEBUG);

	return new webdriver.Builder()
	.usingServer(process.env.WEBDRIVER_SERVER || 'http://hub-cloud.browserstack.com/wd/hub')
	.withCapabilities(Object.assign({
		'browserstack.user': process.env.BROWSERSTACK_USER,
		'browserstack.key': process.env.BROWSERSTACK_ACCESS_KEY,
		'tunnel-identifier': process.env.TRAVIS_JOB_NUMBER,
		build: process.env.TRAVIS_BUILD_NUMBER,
		acceptSslCerts: true,
		browserConnectionEnabled: true,
		newtworkConnectionEnabled: true,
		project: project,
		"browserstack.debug": true,
		"browserstack.local": process.env.BROWSERSTACK_LOCAL,
		"browserstack.video": false,
		"browserstack.localIdentifier": process.env.BROWSERSTACK_LOCAL_IDENTIFIER
	}, getEnvCaps()))
	.setLoggingPrefs(prefs)
	.build();
}

function testPageForStrings(browser, url, strings) {
	return browser.get(url).then(function() {
		return browser.sleep(3000).then(function() {
			return browser.getPageSource();
		}).then(function(html) {
			strings.forEach(function(str) {
				expect(html).to.contain(str);
			});
		});
	});
}

describe("Rendering", function suite() {
	this.timeout(360000); // some browser VM can be slow
	var server, base, browser;

	before(function(done) {
		browser = getBrowser();
		var app = express();
		app.set('views', __dirname + '/public');
		app.get('*', express.static(app.get('views')));
		getPort(9901, function(port) {
			if (port > 9999) return done(new Error("Test might fail on Safari because port is "
				+ port + ", see\nhttps://www.browserstack.com/question/664"));
			server = app.listen(port, function(err) {
				if (err) console.error(err);
				base = host + ':' + server.address().port;
				done();
			});
		});
	});

	after(function() {
		server.close();
		return browser.quit();
	});

	it("should run build and setup", function() {
		return testPageForStrings(browser, base + '/build.html', [
			'data-page-stage="3"',
			'<div class="build">0</div>',
			'<div class="setup">0</div>'
		]);
	});

	it("should run build and patch and setup", function() {
		return testPageForStrings(browser, base + '/patch.html', [
			'data-page-stage="3"',
			'<div class="build">0</div>',
			'<div class="patch">0</div>',
			'<div class="setup">0</div>'
		]);
	});

	it("should run build and patch and setup, call replace and run patch again", function() {
		return testPageForStrings(browser, base + '/replace.html', [
			'data-page-stage="3"',
			'<div class="build">0</div>',
			'<div class="patch">1</div>',
			'<div class="setup">0</div>',
			'<div class="url">/replace.html?toto=1</div>'
		]);
	});

	it("should run build and patch and setup, call push and run patch again", function() {
		return testPageForStrings(browser, base + '/push.html', [
			'data-page-stage="3"',
			'<div class="build">0</div>',
			'<div class="patch">1</div>',
			'<div class="setup">0</div>',
			'<div class="url">/push.html?toto=1</div>'
		]);
	});

	it("should run route and build and setup", function() {
		return testPageForStrings(browser, base + '/route.html?template=build', [
			'data-page-stage="3"',
			'<div class="build">0</div>',
			'<div class="setup">0</div>'
		]);
	});

	it("should run route and imports", function() {
		return testPageForStrings(browser, base + '/route.html?template=import', [
			'data-page-stage="3"',
			"I'm setup0",
			"your body0"
		]);
	});

	it("should render doc with stylesheet and script", function() {
		return testPageForStrings(browser, base + '/order-stylesheets-scripts.html', [
			'<div class="status">squared</div>'
		]);
	});

	it("should load stylesheet before remote script when rendering", function() {
		return testPageForStrings(browser, base + '/route.html?template=order-stylesheets-scripts', [
			'data-page-stage="3"',
			'<div class="status">squared</div>'
		]);
	});

	it("should run route and load script before import", function() {
		return testPageForStrings(browser, base + '/route.html?template=import-depending-on-script', [
			'data-page-stage="3"',
			"I'm setup0",
			"your body770"
		]);
	});
});

