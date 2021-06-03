const assert = require('assert');
const Query = require('../src/query');

describe("Query", function suite() {
	it("should format object", function () {
		assert.strictEqual(Query.format({ test: 1, val: "2" }), "test=1&val=2");
	});

	it("should parse string", function () {
		assert.deepStrictEqual(Query.parse("test=1&val=2"), { test: "1", val: "2" });
	});

	it("should format array", function () {
		assert.strictEqual(Query.format({ test: ["a", "b"] }), "test=a&test=b");
	});

	it("should parse array", function () {
		assert.deepStrictEqual(Query.parse("test=a&test=b"), { test: ["a", "b"] });
	});

	it("should format nested array", function () {
		assert.strictEqual(Query.format({ test: { inside: ["a", "b"] } }), "test.inside=a&test.inside=b");
		assert.strictEqual(Query.format({ "test.inside": ["a", "b"] }), "test.inside=a&test.inside=b");
	});

	it("should parse nested array", function () {
		assert.deepStrictEqual(Query.parse("test.inside=a&test.inside=b"), { "test.inside": ["a", "b"] });
	});

	it("should format array of objects", function () {
		assert.strictEqual(Query.format({
			test: [{ a: "1", b: "2" }, { a: "3", b: "4" }]
		}), "test.a=1&test.b=2&test.a=3&test.b=4");
	});

	it("should parse array of objects", function () {
		assert.deepStrictEqual(Query.parse("test.a=1&test.b=2&test.a=3&test.b=4"), {
			test: [{ a: "1", b: "2" }, { a: "3", b: "4" }]
		});
	});

	it("should format array of nested objects", function () {
		assert.strictEqual(Query.format({
			test: { inside: [{ a: "1", b: "2" }, { a: "3", b: "4" }]}
		}), "test.inside.a=1&test.inside.b=2&test.inside.a=3&test.inside.b=4");
	});

	it("should parse array of nested objects", function () {
		assert.deepStrictEqual(Query.parse("test.inside.a=1&test.inside.b=2&test.inside.a=3&test.inside.b=4"), {
			"test.inside": [{ a: "1", b: "2" }, { a: "3", b: "4" }]
		});
	});
});
