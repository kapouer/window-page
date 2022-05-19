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
		await page.goto("build.html");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
	});

	test("run build and patch and setup", async ({ page }) => {
		await page.goto("patch.html");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("1");
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
	});

	test("state.push using latest state and not old one", async ({ page }) => {
		await page.goto("oldstate.html?param=1");
		await expect(page.locator("body")).toHaveAttribute("data-patch", "1");
	});

	test("run build and patch and setup, call replace and run patch again", async ({ page }) => {
		await page.goto("templates/replace.html");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("2");
		await expect(page.locator("div.paint")).toBeEmpty();
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("div.url")).toHaveText("/templates/replace.html?toto=1");
	});

	test("run build and patch and setup, call push and run patch again", async ({ page }) => {
		await page.goto("templates/push.html");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("2");
		await expect(page.locator("div.paint")).toBeEmpty();
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("div.url")).toHaveText("/templates/push.html?toto=2");
		await expect(page.locator("div.location")).toHaveText("/templates/push.html?toto=2");
	});

	test("load page, navigate, go backward", async ({ page }) => {
		await page.goto("back-patch.html");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.build")).toHaveText("1");
		await expect(page.locator("div.patch")).toHaveText("3");
		await expect(page.locator("div.setup")).toHaveText("1");
		await expect(page.locator("#loc")).toHaveText("/back-patch.html?test=one");
		await expect(page.locator("#back")).toHaveText("/back-patch.html");
	});

	test("run route and build and setup", async ({ page }) => {
		await page.goto("route.html?template=build");
		await expect(page.locator("div.build")).toHaveText("0");
		await expect(page.locator("div.setup")).toHaveText("0");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
	});

	test("render doc with stylesheet and script", async ({ page }) => {
		await page.goto("order-stylesheets-scripts.html");
		await expect(page.locator("div.status")).toHaveText("squared");
	});

	test("load stylesheet before remote script when rendering", async ({ page }) => {
		await page.goto("route.html?template=order-stylesheets-scripts");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.status")).toHaveText("squared");
	});

	test("should run build and patch then setup then back then build", async ({ page }) => {
		await page.goto("templates/back-build.html");
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
		await expect(page.locator("div.build")).toHaveText("2");
		await expect(page.locator("div.close")).toHaveText("1");
		await expect(page.locator("div.setup")).toHaveText("2");
		await expect(page.locator("#click")).toHaveText("1");
		await expect(page.locator("#secondSetup")).toHaveText("ok");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
	});

	test("parse state.hash and run hash chain on click", async ({ page }) => {
		await page.goto("templates/hash-click.html#test");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.hash")).toHaveText("test");
		await expect(page.locator("div.secondhash")).toHaveText("toto");
	});

	test("run hash chain on push", async ({ page }) => {
		await page.goto("templates/hash-push.html");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.hash")).toHaveText("test");
	});

	test("support setup twice for same function", async ({ page }) => {
		await page.goto("templates/early-setup.html");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("div.testA")).toHaveText("2");
		await expect(page.locator("div.testB")).toHaveText("1");
	});

	test("route setup and close and reload", async ({ page }) => {
		await page.goto("templates/reload.html?template=reload-helper");
		await expect(page.locator("html")).toHaveAttribute("data-prerender", "true");
		await expect(page.locator("body")).toHaveAttribute("data-setup", "2");
		await expect(page.locator("body")).toHaveAttribute("data-close", "1");
		await expect(page.locator("#reload")).toHaveText("reloaded");
	});

	test("run state and queue a reload", async ({ page }) => {
		await page.goto("templates/queue-reload.html");
		await expect(page.locator("body > div")).toHaveText("Sampleaa");
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
		await page.goto("templates/custom-elements.html");
		await expect(page.locator("html")).toHaveAttribute("data-query-test", "4");
		await expect(page.locator("html")).toHaveAttribute("data-clicks", "5");
		await expect(page.locator("x-link")).toHaveAttribute("href", "/templates/custom-elements.html?test=6");
	});

	test("connect custom element and close it after pathname nav and its setup", async ({ page }) => {
		await idle(page, "templates/custom-elements-close.html");
		await expect(page.locator("body")).toHaveAttribute("data-setup", "2");
		await expect(page.locator("body")).toHaveAttribute("data-close", "1");
	});

	test("reload current document and not run inline scripts handlers during import", async ({ page }) => {
		await idle(page, "templates/reload-setup.html");
		await expect(page.locator("html")).toHaveAttribute("data-setup", "2");
		await expect(page.locator("html")).toHaveAttribute("data-close", "1");
	});

	test("connect custom element and survive a reload without document import", async ({ page }) => {
		await page.goto("templates/custom-elements-reload.html");
		await expect(page.locator("html")).toHaveAttribute("data-clicks", "2");
	});

	test("connect custom element and not run chains if element is disconnected at once", async ({ page }) => {
		await page.goto("templates/custom-elements-disconnect.html");
		await expect(page.locator("body")).toHaveAttribute("data-setup", "0");
	});

	test("wait for external stylesheet to be loaded", async ({ page }) => {
		await idle(page, "external-stylesheet.html?port=3005");
		await expect(page.locator("div.status")).toHaveText("squared");
	});

	test("patch then setup then patch with same state.data, then build with new state.data", async ({ page }) => {
		await page.goto("templates/data.html");
		await expect(page.locator("body")).toHaveAttribute("data-build", "-1-1");
		await expect(page.locator("body")).toHaveAttribute("data-patch", "-1-2-1");
	});

	test("wait for patch chain to finish, load remote script during patch, run a patch in that script before the chain finished", async ({ page }) => {
		await page.goto("templates/patch-load-patch-finish.html");
		await expect(page.locator("body")).toHaveAttribute("data-finished", "yes");
	});

	test("run listener after an empty chain has been run", async ({ page }) => {
		await page.goto("templates/chain-empty.html");
		await expect(page.locator("body")).toHaveAttribute("data-consent", "run");
	});

	test("setup -> connect -> setup -> connect scroll event", async ({ page }) => {
		await page.goto("templates/custom-elements-connect-scroll.html");
		await expect(page.locator("body")).toHaveAttribute("data-scrolled", "yes");
	});

});

