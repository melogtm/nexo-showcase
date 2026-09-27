import { expect, test } from "vitest";
import { createSession, credentialsMatch, isValidSession } from "./auth";

const creds = { user: "nexo", password: "secret" };

test("credentials", () => {
  expect(credentialsMatch(creds, "nexo", "secret")).toBe(true);
  expect(credentialsMatch(creds, "nexo", "wrong")).toBe(false);
  expect(credentialsMatch(creds, "other", "secret")).toBe(false);
});

test("session cookie", () => {
  const now = 1_000_000;
  const cookie = createSession(creds, now);
  expect(isValidSession(creds, cookie, now + 1)).toBe(true);
  expect(isValidSession(creds, cookie, now + 31 * 24 * 3600 * 1000)).toBe(false); // expired
  expect(isValidSession({ ...creds, password: "rotated" }, cookie, now + 1)).toBe(false);
  expect(isValidSession(creds, cookie.replace(/^\d+/, String(now * 10)), now + 1)).toBe(false); // forged expiry
  expect(isValidSession(creds, undefined)).toBe(false);
  expect(isValidSession(creds, "garbage")).toBe(false);
});
