const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
	timeout: 10000,
	use: {
		browserName: 'chromium',
		channel: 'chrome',
		launchOptions: {
			executablePath: '/usr/bin/chromium'
		}
	},
	expect: {
		timeout: 1 // make expect pooling fail
	}
});
