const { test, expect } = require('@playwright/test');
const { initVisibility, becomeVisible, idle, serve, verbose } = require('./common');


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
		await initVisibility(page, "hidden");
	});

	test("run build then setup", async ({ page }) => {
		const url = "/build.html";
		await page.goto(url);
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.init")).toHaveText("1");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.setup")).toBeEmpty();
		await becomeVisible(page);
		await expect(page.locator("div.init")).toHaveText("1");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.setup")).toHaveText("1");
	});

	test("run build and patch then setup", async ({ page }) => {
		const url = "/patch.html";
		await page.goto(url);
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("1");
		await expect(page.locator("div.setup")).toBeEmpty();
		const html = await page.content();
		await page.route(url, route => {
			route.fulfill({
				contentType: 'text/html',
				body: html
			});
		});
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("1");
		await expect(page.locator("div.setup")).toHaveText("1");
	});

	test("load stylesheet when rendering", async ({ context, page }) => {
		const url = "/route.html?template=stylesheets";
		await page.route('**/*.css', route => route.abort(), { times: 1 });
		await idle(page, url);
		await expect(page.locator("div.status")).toHaveText("hidden0");
		const html = await page.content();
		await page.route(url, route => {
			route.fulfill({
				contentType: 'text/html',
				body: html
			});
		});
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("div.status")).toHaveText("squared0");
	});

	test("load stylesheet before inline script when rendering", async ({ page }) => {
		const url = "/route.html?template=order-stylesheets";
		await page.route('**/*.css', route => route.abort(), { times: 1 });
		await page.goto(url);
		await expect(page.locator("div.status")).not.toHaveText("squared");
		const html = await page.content();
		await page.route(url, route => {
			route.fulfill({
				contentType: 'text/html',
				body: html
			});
		});
		await initVisibility(page, "visible");
		await page.goto(url);
		await expect(page.locator("div.status")).toHaveText("squared");
	});

	test("run build then setup then hash", async ({ page }) => {
		const url = "/hash.html#test";
		await idle(page, url);
		await page.evaluate(state => {
			Object.defineProperty(document, "visibilityState", {
				configurable: true,
				get: function () { return state; }
			});
			Object.defineProperty(document, "hidden", {
				configurable: true,
				get: function () { return this.visibilityState != "visible"; }
			});
			document.dispatchEvent(new Event("visibilitychange", {}));
		}, "visible");

		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("#hash")).toHaveText("test");
	});

	test("run setup and finally", async ({ page }) => {
		const url = "/setup.html";
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("div.orders")).toHaveText("setup,setup2,setup21-false,finally");
	});

	test("run setup and finally, then setup then close", async ({ page }) => {
		const url = "/setup.html?close";
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("div.close")).toHaveText("1");
		await expect(page.locator("div.orders")).toHaveText("setup,setup2,setup21-true,setup,setup2,setup21-false,finally,close");
	});

	test("route two pages forward, then two pages backward", async ({ page }) => {
		const url = "/nav-1.html";
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("body")).toHaveText("|/nav-1.html|/nav-2.html|/nav-3.html|/nav-2.html|/nav-1.html");
	});

	test("connect custom element and keep handler across patch nav", async ({ page }) => {
		const url = "/custom-elements.html";
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("x-link")).toHaveAttribute("href", "/custom-elements.html?test=4");
	});

	test("run connected element patch when called out-of-navigation during setup", async ({ page }) => {
		const url = "/custom-elements-patch.html";
		await idle(page, url);
		await becomeVisible(page);
		await expect(page.locator("x-link")).toHaveAttribute("href", "/custom-elements-patch.html?test=4");
	});
});

