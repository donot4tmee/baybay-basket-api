import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/repository.js";
import { ApiService } from "../src/service.js";
import { ApiError } from "../src/errors.js";

test("only system administrators can configure and run retention", async () => {
  const service = new ApiService(new InMemoryRepository());
  const admin = { uuid: "admin", role: "system_admin" as const };
  const customer = { uuid: "customer", role: "customer" as const };

  await service.setConfiguration(admin, "retention.order_days", "365");
  assert.equal((await service.listConfiguration(admin))[0]?.value, "365");
  assert.deepEqual(await service.runRetention(admin, 365), {
    archivedAccounts: 0,
    archivedOrders: 0,
  });

  await assert.rejects(
    () => service.listConfiguration(customer),
    (error: unknown) => error instanceof ApiError && error.code === "FORBIDDEN",
  );
  await assert.rejects(
    () => service.runRetention(admin, 29),
    (error: unknown) => error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );
});
