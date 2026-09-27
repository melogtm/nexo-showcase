import { expect, test } from "vitest";
import { isAuthorized } from "./proxy";

const basic = (s: string) => `Basic ${Buffer.from(s).toString("base64")}`;

test("basic auth", () => {
  expect(isAuthorized(basic("nexo:secret"), "nexo", "secret")).toBe(true);
  expect(isAuthorized(basic("nexo:wrong"), "nexo", "secret")).toBe(false);
  expect(isAuthorized(null, "nexo", "secret")).toBe(false);
  expect(isAuthorized("Bearer x", "nexo", "secret")).toBe(false);
});
