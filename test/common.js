const express = require('express');
const tracker = require('./tracker');
const { randomUUID } = require('node:crypto');
const { expect } = require('@playwright/test');

function defineVisibility(state) {
	const prev = document.visibilityState;
	Object.defineProperty(document, "visibilityState", {
		configurable: true,
		get: function () { return state; }
	});
	Object.defineProperty(document, "hidden", {
		configurable: true,
		get: function () { return this.visibilityState != "visible"; }
	});
	if (prev != state) {
		document.dispatchEvent(new Event("visibilitychange", {}));
	}
}

function noStyle(route, request) {
	if (request.resourceType() == "stylesheet") route.abort();
	else route.continue();
}

exports.hide = async function (page) {
	await page.addInitScript(defineVisibility, "hidden");
	await page.route('**/*.css', noStyle);
};

exports.show = async function (page) {
	await page.unroute('**/*.css', noStyle);
	await page.evaluate(defineVisibility, "visible");
};

exports.serve = () => {
	const app = express();
	app.set('views', __dirname + '/public');
	app.use((req, res, next) => {
		const delay = Number.parseInt(req.query.delay) || 0;
		if (delay) {
			setTimeout(next, delay);
		} else {
			next();
		}
	});
	app.get(
		/\.(json|js|css|png|html)$/,
		express.static(app.get('views'))
	);
	return app;
};

exports.idle = async function (page, url) {
	page.isText = async (selector, str) => {
		const txt = await page.evaluate(selector => {
			return document.querySelector(selector).textContent;
		}, selector);
		expect(txt).toBe(str);
	};
	page.isNotText = async (selector, str) => {
		const txt = await page.evaluate(selector => {
			return document.querySelector(selector).textContent;
		}, selector);
		expect(txt).not.toBe(str);
	};
	page.isAttr = async (selector, attr, str) => {
		const txt = await page.evaluate(({ selector, attr }) => {
			return document.querySelector(selector)?.getAttribute(attr);
		}, { selector, attr });
		expect(txt).toBe(str);
	};
	const fnid = 'signal_' + randomUUID();
	await page.addInitScript(tracker, {
		id: fnid,
		timeout: 3000
	});
	await page.goto(url, {
		waitUntil: "networkidle"
	});
	await page.evaluate(id => window[id], fnid);
};

exports.render = async function (page) {
	const fnid = 'signal_' + randomUUID();
	await page.addInitScript(tracker, {
		id: fnid,
		timeout: 3000
	});
	const html = await page.content();
	const url = page.url();
	await page.addInitScript(defineVisibility, "visible");
	await page.unroute('**/*.css', noStyle);
	await page.route(url, route => {
		route.fulfill({
			contentType: 'text/html',
			body: html
		});
	}, { times: 1 });
	await page.goto(url, {
		waitUntil: "networkidle"
	});
	await page.evaluate(id => window[id], fnid);
};

exports.verbose = async function (page) {
	page.on('console', msg => {
		console.warn(msg.type(), msg.text());
	});
};
