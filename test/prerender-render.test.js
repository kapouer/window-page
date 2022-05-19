const { test } = require('@playwright/test');
const { render, hide, idle, serve, verbose } = require('./common');


test.describe("Two-phase rendering", () => {
	let server;

	test.use({ baseURL: 'http://localhost:3002' });

	test.beforeAll(async ({ browser }, testInfo) => {
		const app = serve();
		server = app.listen(3002);
	});

	test.afterAll(async () => {
		server.close();
	});

	test.beforeEach(async ({ page }) => {
		await verbose(page);
		await hide(page);
	});

	test("run build then setup", async ({ page }) => {
		const url = "/build.html";
		await idle(page, url);
		await page.isAttr('html', 'data-prerender', 'true');
		await page.isText('div.init', '1');
		await page.isText('div.build', '1');
		await page.isText('div.setup', '');
		await render(page);
		await page.isText('div.init', '2');
		await page.isText('div.build', '1');
		await page.isText('div.setup', '1');
	});

	test("run build and patch then setup", async ({ page }) => {
		const url = "/patch.html";
		await idle(page, url);
		await page.isAttr('html', 'data-prerender', 'true');
		await page.isText('div.build', '1');
		await page.isText('div.patch', '1');
		await page.isText('div.setup', '');

		await render(page);
		await page.isText('div.build', '1');
		await page.isText('div.patch', '1');
		await page.isText('div.setup', '1');
	});

	test("load stylesheet when rendering", async ({ context, page }) => {
		const url = "/route.html?template=stylesheets";
		await idle(page, url);
		await page.isText('div.status', 'hidden0');
		await render(page);
		await page.isText('div.status', 'squared0');
	});

	test("load stylesheet before inline script when rendering", async ({ page }) => {
		const url = "/route.html?template=order-stylesheets";
		await page.route('**/*.css', route => route.abort(), { times: 1 });
		await idle(page, url);
		await page.isNotText('div.status', 'squared');
		await render(page);
		await page.isText('div.status', 'squared');
	});

	test("run build then setup then hash", async ({ page }) => {
		const url = "/hash.html#test";
		await idle(page, url);
		await render(page);
		await page.isText('div.build', '1');
		await page.isText('div.setup', '1');
		await page.isText('#hash', 'test');
	});

	test("run setup and finally", async ({ page }) => {
		const url = "/setup.html";
		await idle(page, url);
		await render(page);
		await page.isText('div.setup', '1');
		await page.isText('div.orders', "setup,setup2,setup21-false,finally");
	});

	test("run setup and finally, then setup then close", async ({ page }) => {
		const url = "/setup.html?close";
		await idle(page, url);
		await render(page);
		await page.isText('div.setup', '2');
		await page.isText('div.close', '1');
		await page.isText('div.orders',
			"setup,setup2,setup21-true,setup,setup2,setup21-false,finally,close"
		);
	});

	test("route two pages forward, then two pages backward", async ({ page }) => {
		const url = "/nav-1.html";
		await idle(page, url);
		await render(page);
		await page.isText('body',
			"|/nav-1.html|/nav-2.html|/nav-3.html|/nav-2.html|/nav-1.html"
		);
	});

	test("connect custom element and keep handler across patch nav", async ({ page }) => {
		const url = "/custom-elements.html";
		await idle(page, url);
		await render(page);
		await page.isAttr('x-link', 'href',
			"/custom-elements.html?test=3"
		);
	});

	test("run connected element patch when called out-of-navigation during setup", async ({ page }) => {
		const url = "/custom-elements-patch.html";
		await idle(page, url);
		await render(page);
		await page.isAttr('x-link', 'href',
			"/custom-elements-patch.html?test=4"
		);
	});
});

