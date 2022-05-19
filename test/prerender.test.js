const { test, expect } = require('@playwright/test');
const { idle, hide, serve, verbose } = require('./common');



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
		await hide(page);
	});


	test("run build but not setup", async ({ page }) => {
		await idle(page, "build.html");
		await page.locator('div.build').isText('1');
		await page.locator('div.setup').isText('');
	});

	test("run build and patch but not setup", async ({ page }) => {
		await idle(page, "patch.html");
		await page.locator('div.build').isText('1');
		await page.locator('div.patch').isText('1');
		await page.locator('div.setup').isText('');
	});

	test("run route and build", async ({ page }) => {
		await idle(page, "route.html?template=build");
		await page.locator('div.build').isText('0');
		await page.locator('div.setup').isText('');
	});

	test("run route and load scripts in correct order", async ({ page }) => {
		await idle(page, "route.html?template=order-scripts");
		await page.locator('div.abc').isText('ABBACCBAC');
	});

	test("not load stylesheets", async ({ page }) => {
		await idle(page, "route.html?template=stylesheets");
		await page.locator('div.setup').isText('squared0');
	});

	test("run route and not load already loaded scripts", async ({ page }) => {
		await idle(page, "route.html?template=already-loaded");
		await page.locator('div.mymark').isText('1');
	});

	test("reload document during prerendering", async ({ page }) => {
		await idle(page, "route.html?template=reload-patch");
		await page.locator('html').isAttr('data-patchs', "2");
	});

});

