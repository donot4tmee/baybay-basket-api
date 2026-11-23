import test from "node:test";
import assert from "node:assert/strict";
import {
  requireBusinessOwnership,
  requireRole,
} from "../src/authorization.js";
import { ApiError } from "../src/errors.js";

test("allows an owner or administrator to manage a business", () => {
  assert.doesNotThrow(() =>
    requireBusinessOwnership(
      { uuid: "owner", role: "business" },
      "owner",
    ),
  );
  assert.doesNotThrow(() =>
    requireBusinessOwnership(
      { uuid: "admin", role: "platform_admin" },
      "owner",
    ),
  );
});

test("rejects a different business and disallowed role", () => {
  assert.throws(
    () =>
      requireBusinessOwnership(
        { uuid: "other", role: "business" },
        "owner",
      ),
    (error: unknown) => error instanceof ApiError && error.code === "FORBIDDEN",
  );
  assert.throws(
    () => requireRole({ uuid: "customer", role: "customer" }, "business"),
    (error: unknown) => error instanceof ApiError && error.code === "FORBIDDEN",
  );
});
