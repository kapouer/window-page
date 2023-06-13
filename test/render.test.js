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
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.build', '1');
		await page.isText('div.setup', '1');
	});

	test("run build and patch and setup", async ({ page }) => {
		await idle(page, "patch.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.build', '1');
		await page.isText('div.patch', '1');
		await page.isText('div.setup', '1');
	});

	test("run patch reload vary patch and state finish", async ({ page }) => {
		await idle(page, "patch-reload.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isAttr('body', "data-test", "f");
	});

	test("state.push using latest state and not old one", async ({ page }) => {
		await idle(page, "oldstate.html?param=1");
		await page.isAttr('body', "data-patch", "1");
	});

	test("run build and patch and setup, call replace and run patch again", async ({ page }) => {
		await idle(page, "templates/replace.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.build', '1');
		await page.isText('div.patch', '2');
		await page.isText('div.paint', '');
		await page.isText('div.setup', '1');
		await page.isText('div.url', "/templates/replace.html?toto=1");
	});

	test("run build and patch and setup, call push and run patch again", async ({ page }) => {
		await idle(page, "templates/push.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.build', '1');
		await page.isText('div.patch', '3');
		await page.isText('div.paint', '');
		await page.isText('div.setup', '1');
		await page.isText('div.url', "/templates/push.html?toto=2");
		await page.isText('div.location', "/templates/push.html?toto=2");
	});

	test("load page, navigate, go backward", async ({ page }) => {
		await idle(page, "back-patch.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.build', '1');
		await page.isText('div.patch', '3');
		await page.isText('div.setup', '1');
		await page.isText('#loc', "/back-patch.html?test=one");
		await page.isText('#back', "/back-patch.html");
	});

	test("run route and build and setup", async ({ page }) => {
		await idle(page, "route.html?template=build");
		await page.isText('div.build', '0');
		await page.isText('div.setup', '0');
		await page.isAttr('html', "data-prerender", "true");
	});

	test("render doc with stylesheet and script", async ({ page }) => {
		await idle(page, "order-stylesheets-scripts.html");
		await page.isText('div.status', 'squared');
	});

	test("run route and do not load style or json because of CSP", async ({ page }) => {
		await idle(page, "route.html?template=csp");
		await page.isText('div.style', 'not loaded');
		await page.isText('div.xhr', 'not loaded');
	});

	test("load stylesheet before remote script when rendering", async ({ page }) => {
		await idle(page, "route.html?template=order-stylesheets-scripts");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.status', 'squared');
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
		await page.isText('div.build', '2');
		await page.isText('div.close', '1');
		await page.isText('div.setup', '2');
		await page.isText('#click', 'handled clicks1');
		await page.isText('#secondSetup', 'ok');
		await page.isAttr('html', "data-prerender", "true");
	});

	test("parse state.hash and run hash chain on click", async ({ page }) => {
		await idle(page, "templates/hash-click.html#test");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.hash', '#test');
		await page.isText('div.secondhash', '#toto');
	});

	test("run hash chain on push", async ({ page }) => {
		await idle(page, "templates/hash-push.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.hash', '#test');
	});

	test("support setup twice for same function", async ({ page }) => {
		await idle(page, "templates/early-setup.html");
		await page.isAttr('html', "data-prerender", "true");
		await page.isText('div.testA', '2');
		await page.isText('div.testB', '1');
	});

	test("route setup and close and reload", async ({ page }) => {
		await idle(page, "templates/reload.html?template=reload-helper");
		await page.isAttr('html', "data-prerender", "true");
		await page.isAttr('body', "data-setup", "2");
		await page.isAttr('body', "data-close", "1");
		await page.isText('#reload', 'reloaded');
	});

	test("run state and queue a reload", async ({ page }) => {
		await idle(page, "templates/queue-reload.html");
		await page.isText('body > div', 'Sampleaa');
	});

	test("set a router and run it and next page, and on previous page", async ({ page }) => {
		await idle(page, "templates/route-spa.html");
		const str = await page.evaluate(() => {
			return window.test1 + window.test2;
		});
		expect(str.replace(/[\n\t]+/g, '')).toBe(`
		<html lang="en" data-prerender="true" data-patches="3"><body>first</body></html>
		<html lang="fr" data-removed="true" data-prerender="true" data-patches="2"><body>two
		</body></html>`.replace(/[\n\t]+/g, ''));
	});

	test("connect custom element and keep handler across patch nav", async ({ page }) => {
		await idle(page, "templates/custom-elements.html");
		await page.isAttr('html', "data-query-test", "4");
		await page.isAttr('html', "data-clicks", "5");
		await page.isAttr('x-link', "href",
			"/templates/custom-elements.html?test=6"
		);
	});

	test("connect custom element and close it after pathname nav and its setup", async ({ page }) => {
		await idle(page, "templates/custom-elements-close.html");
		await page.isAttr('body', "data-setup", "2");
		await page.isAttr('body', "data-close", "1");
	});

	test("reload current document and not run inline scripts handlers during import", async ({ page }) => {
		await idle(page, "templates/reload-setup.html");
		await page.isAttr('html', "data-setup", "2");
		await page.isAttr('html', "data-close", "1");
	});

	test("connect custom element and survive a reload without document import", async ({ page }) => {
		await idle(page, "templates/custom-elements-reload.html");
		await page.isAttr('html', "data-clicks", "2");
	});

	test("connect and disconnect custom element", async ({ page }) => {
		await idle(page, "templates/custom-elements-disconnect.html");
		await page.isAttr('body', "data-setup", "1");
		await page.isAttr('body', "data-close", "1");
	});

	test("wait for external stylesheet to be loaded", async ({ page }) => {
		await idle(page, "external-stylesheet.html?port=3005");
		await page.isText('div.status', 'squared');
	});

	test("patch then setup then patch with same state.data, then build with new state.data", async ({ page }) => {
		await idle(page, "templates/data.html");
		await page.isAttr('body', "data-build", "-1-1");
		await page.isAttr('body', "data-patch", "-1-1-2");
	});

	test("wait for patch chain to finish, load remote script during patch, run a patch in that script before the chain finished", async ({ page }) => {
		await idle(page, "templates/patch-load-patch-finish.html");
		await page.isAttr('body', "data-finished", "yes");
	});

	test("run listener after an empty chain has been run", async ({ page }) => {
		await idle(page, "templates/chain-empty.html");
		await page.isAttr('body', "data-consent", "run");
	});

	test("setup -> connect -> setup -> connect scroll event", async ({ page }) => {
		await idle(page, "templates/custom-elements-connect-scroll.html");
		await page.isAttr('body', "data-scrolled", "yes");
	});

	test("navigate to other url and close script-bound listener of previous page", async ({ page }) => {
		await idle(page, "setup-close.html");
		await page.isAttr('html', "data-setup", "setup2");
		await page.isAttr('html', "data-close", "close1");
		await page.isAttr('html', "data-patch", "2");
	});

	test("paint vary patch should not run paint twice", async ({ page }) => {
		await idle(page, "paint-no-twice.html?test=1");
		await page.isAttr('html', "data-test", "undefined");
	});

});

