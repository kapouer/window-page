const { test } = require('@playwright/test');
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
		await page.isText('div.build', '1');
		await page.isText('div.setup', '');
	});

	test("run build with async", async ({ page }) => {
		await idle(page, "script-async.html");
		await page.isAttr('body', "data-path", "/script-async.html");
	});

	test("run build and patch but not setup", async ({ page }) => {
		await idle(page, "patch.html");
		await page.isText('div.build', '1');
		await page.isText('div.patch', '1');
		await page.isText('div.setup', '');
	});

	test("run route and build", async ({ page }) => {
		await idle(page, "route.html?template=build");
		await page.isText('div.build', '0');
		await page.isText('div.setup', '');
	});

	test("run route and load scripts in correct order", async ({ page }) => {
		await idle(page, "route.html?template=order-scripts");
		await page.isText('div.abc', 'ABBACCBAC');
	});

	test("not load stylesheets", async ({ page }) => {
		await idle(page, "route.html?template=stylesheets");
		await page.isText('div.status', 'hidden0');
	});

	test("run route and not load already loaded scripts", async ({ page }) => {
		await idle(page, "route.html?template=already-loaded");
		await page.isText('div.mymark', '1');
	});

	test("reload document during prerendering", async ({ page }) => {
		await idle(page, "route.html?template=reload-patch");
		await page.isAttr('html', 'data-patchs', "2");
	});

});

