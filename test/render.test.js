const { test, expect } = require('@playwright/test');
const { idle, serve, verbose } = require('./common');



test.describe("Rendering", () => {

	let server1, server2;

	test.use({ baseURL: 'http://localhost:3004' });

	test.beforeAll(async ({ browser }, testInfo) => {
		const app = serve();
		server1 = app.listen(3004);
		server2 = app.listen(3005);
	});

	test.afterAll(async () => {
		server1.close();
		server2.close();
	});

	test.beforeEach(async ({ page }) => {
		await verbose(page);
	});


	test("run build and setup", async ({ page }) => {
		await idle(page, "build.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.build').isText('1');
		await page.locator('div.setup').isText('1');
	});

	test("run build and patch and setup", async ({ page }) => {
		await idle(page, "patch.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.build').isText('1');
		await page.locator('div.patch').isText('1');
		await page.locator('div.setup').isText('1');
	});

	test("state.push using latest state and not old one", async ({ page }) => {
		await idle(page, "oldstate.html?param=1");
		await page.locator('body').isAttr("data-patch", "1");
	});

	test("run build and patch and setup, call replace and run patch again", async ({ page }) => {
		await idle(page, "templates/replace.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.build').isText('1');
		await page.locator('div.patch').isText('2');
		await page.locator('div.paint').isText('');
		await page.locator('div.setup').isText('1');
		await page.locator('div.url').isText("/templates/replace.html?toto=1");
	});

	test("run build and patch and setup, call push and run patch again", async ({ page }) => {
		await idle(page, "templates/push.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.build').isText('1');
		await page.locator('div.patch').isText('3');
		await page.locator('div.paint').isText('');
		await page.locator('div.setup').isText('1');
		await page.locator('div.url').isText("/templates/push.html?toto=2");
		await page.locator('div.location').isText("/templates/push.html?toto=2");
	});

	test("load page, navigate, go backward", async ({ page }) => {
		await idle(page, "back-patch.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.build').isText('1');
		await page.locator('div.patch').isText('3');
		await page.locator('div.setup').isText('1');
		await page.locator('#loc').isText("/back-patch.html?test=one");
		await page.locator('#back').isText("/back-patch.html");
	});

	test("run route and build and setup", async ({ page }) => {
		await idle(page, "route.html?template=build");
		await page.locator('div.build').isText('0');
		await page.locator('div.setup').isText('0');
		await page.locator('html').isAttr("data-prerender", "true");
	});

	test("render doc with stylesheet and script", async ({ page }) => {
		await idle(page, "order-stylesheets-scripts.html");
		await page.locator('div.status').isText('squared');
	});

	test("load stylesheet before remote script when rendering", async ({ page }) => {
		await idle(page, "route.html?template=order-stylesheets-scripts");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.status').isText('squared');
	});

	test("should run build and patch then setup then back then build", async ({ page }) => {
		await idle(page, "templates/back-build.html");
		await page.evaluate(() => {
			return new Promise(ok => {
				window.testcb = ok;
				try {
					const script = document.createElement('script');
					script.textContent = `
					Page.setup(function(state) {
						if (state.pathname == "/inexistent.html") setTimeout(function() {
							window.simClick();
							window.testcb();
						}, 250);
					});`;
					document.head.appendChild(script);
				} catch(ex) {
					console.error(ex);
				}
			});
		});
		await page.locator('div.build').isText('2');
		await page.locator('div.close').isText('1');
		await page.locator('div.setup').isText('2');
		await page.locator('#click').isText('1');
		await page.locator('#secondSetup').isText('ok');
		await page.locator('html').isAttr("data-prerender", "true");
	});

	test("parse state.hash and run hash chain on click", async ({ page }) => {
		await idle(page, "templates/hash-click.html#test");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.hash').isText('test');
		await page.locator('div.secondhash').isText('toto');
	});

	test("run hash chain on push", async ({ page }) => {
		await idle(page, "templates/hash-push.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.hash').isText('test');
	});

	test("support setup twice for same function", async ({ page }) => {
		await idle(page, "templates/early-setup.html");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.testA').isText('2');
		await page.locator('div.testB').isText('1');
	});

	test("route setup and close and reload", async ({ page }) => {
		await idle(page, "templates/reload.html?template=reload-helper");
		await page.locator('html').isAttr("data-prerender", "true");
		await page.locator('div.close').isText('1');
		await page.locator('div.setup').isText('2');
		await page.locator('#reload').isText('reloaded');
	});

	test("run state and queue a reload", async ({ page }) => {
		await idle(page, "templates/queue-reload.html");
		await page.locator('body > div').isText('Sampleaa');
	});

	test("set a router and run it and next page, and on previous page", async ({ page }) => {
		await idle(page, "templates/route-spa.html");
		const str = await page.evaluate(() => {
			return window.test1 + window.test2;
		});
		expect(str.replace(/[\n\t]+/g, '')).toBe(`
		<html lang="en" data-prerender="true"><head>
			<title>first</title>
			<script src="/spa.js"></script>
		</head>
		<body>first
		</body></html>
		<html lang="fr" data-removed="true" data-prerender="true"><head>
			<title>two</title>
			<script src="/spa.js"></script>
		</head>
		<body>two
		</body></html>`.replace(/[\n\t]+/g, ''));
	});

	test("connect custom element and keep handler across patch nav", async ({ page }) => {
		await idle(page, "templates/custom-elements.html");
		await page.locator('html').isAttr("data-query-test", "4");
		await page.locator('html').isAttr("data-clicks", "5");
		await page.locator('x-link').isAttr("href",
			"/templates/custom-elements.html?test=6"
		);
	});

	test("connect custom element and close it after pathname nav and its setup", async ({ page }) => {
		await idle(page, "templates/custom-elements-close.html");
		await page.locator('body').isAttr("data-setup", "2");
		await page.locator('body').isAttr("data-close", "1");
	});

	test("reload current document and not run inline scripts handlers during import", async ({ page }) => {
		await idle(page, "templates/reload-setup.html");
		await page.locator('html').isAttr("data-setup", "2");
		await page.locator('html').isAttr("data-close", "1");
	});

	test("connect custom element and survive a reload without document import", async ({ page }) => {
		await idle(page, "templates/custom-elements-reload.html");
		await page.locator('html').isAttr("data-clicks", "2");
	});

	test("connect custom element and not run chains if element is disconnected at once", async ({ page }) => {
		await idle(page, "templates/custom-elements-disconnect.html");
		await page.locator('body').isAttr("data-setup", "0");
	});

	test("wait for external stylesheet to be loaded", async ({ page }) => {
		await idle(page, "external-stylesheet.html?port=3005");
		await page.locator('div.status').isText('squared');
	});

	test("patch then setup then patch with same state.data, then build with new state.data", async ({ page }) => {
		await idle(page, "templates/data.html");
		await page.locator('body').isAttr("data-build", "-1-1");
		await page.locator('body').isAttr("data-patch", "-1-2-1");
	});

	test("wait for patch chain to finish, load remote script during patch, run a patch in that script before the chain finished", async ({ page }) => {
		await idle(page, "templates/patch-load-patch-finish.html");
		await page.locator('body').isAttr("data-finished", "yes");
	});

	test("run listener after an empty chain has been run", async ({ page }) => {
		await idle(page, "templates/chain-empty.html");
		await page.locator('body').isAttr("data-consent", "run");
	});

	test("setup -> connect -> setup -> connect scroll event", async ({ page }) => {
		await idle(page, "templates/custom-elements-connect-scroll.html");
		await page.locator('body').isAttr("data-scrolled", "yes");
	});

});

