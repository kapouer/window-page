// playwright.config.js
// @ts-check
const {
    devices
} = require("@playwright/test");

/** @type {import('@playwright/test').PlaywrightTestConfig} */
const config = {
    projects: [
        { name: 'Firefox', use: { browserName: 'firefox' }, },
    ],
};

module.exports = config;