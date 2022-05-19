const express = require('express');
const tracker = require('./tracker');
const { randomUUID } = require('node:crypto');

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

exports.initVisibility = async function (page) {
	await page.addInitScript(defineVisibility, "hidden");
};

exports.becomeVisible = async function (page) {
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

exports.verbose = async function (page) {
	page.on('console', msg => {
		console.warn(msg.type(), msg.text());
	});
};
