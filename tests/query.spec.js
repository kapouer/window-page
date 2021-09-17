
const Query = require("../lib/query");

const { test, expect } = require('@playwright/test');

test.describe("Query should format", function () {
  test("object", function () {
    expect(Query.format({ test: 1, val: "2" })).toEqual("test=1&val=2");
  });

  test("array", function () {
    expect(Query.format({ test: ["a", "b"] })).toEqual("test=a&test=b");
  });

  test("nested array", function () {
    expect(Query.format({ test: { inside: ["a", "b"] } })).toEqual("test.inside=a&test.inside=b");
    expect(Query.format({ "test.inside": ["a", "b"] })).toEqual("test.inside=a&test.inside=b");
  });

  test("array of objects", function () {
    expect(Query.format({
      test: [{ a: "1", b: "2" }, { a: "3", b: "4" }]
    })).toEqual("test.a=1&test.b=2&test.a=3&test.b=4");
  });

  test("array of nested objects", function () {
    expect(Query.format({
      test: { inside: [{ a: "1", b: "2" }, { a: "3", b: "4" }] }
    })).toEqual("test.inside.a=1&test.inside.b=2&test.inside.a=3&test.inside.b=4");
  });

})

test.describe("Query should parse", function () {

  test("string", function () {
    expect(Query.parse("test=1&val=2")).toEqual({ test: "1", val: "2" });
  });

  test("nested array", function () {
    expect(Query.parse("test.inside=a&test.inside=b")).toEqual({ "test.inside": ["a", "b"] });
  });

  test("array of objects", function () {
    expect(Query.parse("test.a=1&test.b=2&test.a=3&test.b=4")).toEqual({
      test: [{ a: "1", b: "2" }, { a: "3", b: "4" }]
    });
  });

  test("array of nested objects", function () {
    expect(Query.parse("test.inside.a=1&test.inside.b=2&test.inside.a=3&test.inside.b=4")).toEqual({
      "test.inside": [{ a: "1", b: "2" }, { a: "3", b: "4" }]
    });
  });



})