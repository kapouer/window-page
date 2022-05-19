const { test, expect } = require('@playwright/test');
const { initVisibility, serve, verbose } = require('./common');



test.describe("Prerendering", () => {

	let server;

	test.use({ baseURL: 'http://localhost:3003' });

	test.beforeAll(async ({ browser }, testInfo) => {
		const app = serve();
		server = app.listen(3003);
	});

	test.afterAll(async () => {
		server.close();
	});

	test.beforeEach(async ({ page }) => {
		// inject user script
		await verbose(page);
		await initVisibility(page);
	});


	test("run build but not setup", async ({ page }) => {
		await page.goto("build.html");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.setup")).toBeEmpty();
	});

	test("run build and patch but not setup", async ({ page }) => {
		await page.goto("patch.html");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("1");
		await expect(page.locator("div.setup")).toBeEmpty();
	});

	test("run route and build", async ({ page }) => {
		await page.goto("route.html?template=build");
		await expect(page.locator("div.build")).toHaveText("0");
		await expect(page.locator("div.setup")).toBeEmpty();
	});

	test("run route and load scripts in correct order", async ({ page }) => {
		await page.goto("route.html?template=order-scripts");
		await expect(page.locator("div.abc")).toHaveText("ABBACCBAC");
	});

	test("not load stylesheets", async ({ page }) => {
		await page.goto("route.html?template=stylesheets");
		await expect(page.locator("div.status")).toHaveText("squared0");
	});

	test("run route and not load already loaded scripts", async ({ page }) => {
		await page.goto("route.html?template=already-loaded");
		await expect(page.locator("div.mymark")).toHaveText("1");
	});

	test("reload document during prerendering", async ({ page }) => {
		await page.goto("route.html?template=reload-patch");
		await expect(page.locator("html")).toHaveAttribute("data-patchs", "2");
	});

});

