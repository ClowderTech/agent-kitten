import test from "node:test";
import assert from "node:assert";
import { getNestedKey, setNestedKey } from "../utils/config.ts";

test("config basic get", () => {
	assert.deepStrictEqual(getNestedKey({ hello: "world" }, "hello"), "world");
});

test("config basic set", () => {
	assert.deepStrictEqual(
		setNestedKey({ hello: "world" }, "hello", "gaming"),
		{
			hello: "gaming",
		}
	);
});
