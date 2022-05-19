module.exports = {
	timeout: 10000,
	use: {
		browserName: 'chromium',
		channel: 'chrome'
	},
	expect: {
		timeout: 1 // make expect pooling fail
	}
};
