module.exports = {
	timeout: 10000,
	projects: [{
		name: 'Default',
		channel: process.env.BROWSER ?? 'chrome',
		retries: 0,
	}],
	use: {
		baseURL: 'http://localhost:3030'
	}
};
