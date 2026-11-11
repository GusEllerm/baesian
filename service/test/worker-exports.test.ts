import { expect, it } from "vitest";
import * as worker from "../src/index.js";

// Cloudflare's runtime starts a Worker only if everything its main module exports is a handler, a function or a class:
// a plain value there ("Incorrect type for map entry") stops it starting at all, which these tests wouldn't otherwise
// see, since they import the module rather than run it as the Worker's main.

it("the Worker's main module exports only its handler, functions and classes", () => {
  const plain = Object.entries(worker).filter(([name, value]) => name !== "default" && typeof value !== "function");
  expect(plain.map(([name]) => name)).toEqual([]);
  expect(typeof worker.default.fetch).toBe("function");
});
