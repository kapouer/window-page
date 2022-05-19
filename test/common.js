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

exports.hide = async function (page) {
	await page.addInitScript(defineVisibility, "hidden");
};

exports.show = async function (page) {
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
	const p = page.locator('html');

	Object.assign(Object.getPrototypeOf(p), {
		isText: async function(str) {
			expect(await this.innerText()).toBe(str);
		},
		isNotText: async function(str) {
			expect(await this.innerText()).not.toBe(str);
		},
		isAttr: async function(attr, str) {
			expect(await this.getAttribute(attr)).toBe(str);
		}
	});
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
