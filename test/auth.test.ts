import test from "node:test";
import assert from "node:assert/strict";
import {
  authenticateRequest,
  extractBearerToken,
} from "../src/auth.js";
import { ApiError } from "../src/errors.js";

test("extracts a bearer token without accepting malformed headers", () => {
  assert.equal(extractBearerToken("Bearer token-value"), "token-value");
  assert.equal(extractBearerToken("Basic token-value"), null);
  assert.equal(extractBearerToken("Bearer token value"), null);
});

test("authenticates through the verifier boundary", async () => {
  const actor = { uuid: "actor", role: "customer" as const };
  const result = await authenticateRequest("Bearer valid", {
    verifyAccessToken: async (token) => (token === "valid" ? actor : null),
  });
  assert.deepEqual(result, actor);
});

test("rejects missing and invalid access tokens", async () => {
  await assert.rejects(
    () => authenticateRequest(undefined, { verifyAccessToken: async () => null }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "UNAUTHORIZED",
  );
  await assert.rejects(
    () =>
      authenticateRequest("Bearer invalid", {
        verifyAccessToken: async () => null,
      }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "UNAUTHORIZED",
  );
});
