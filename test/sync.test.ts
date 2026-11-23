import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRepository } from "../src/repository.js";

const actor = {
  uuid: "33333333-3333-4333-8333-333333333333",
  role: "customer" as const,
};

test("accepts newer sync rows and acknowledges stale retries", async () => {
  const repository = new InMemoryRepository();
  const first = {
    table: "product",
    uuid: "11111111-1111-4111-8111-111111111111",
    updatedAt: "2026-01-01T00:00:00.000Z",
    archivedAt: null,
    fields: { createdBy: actor.uuid, name: "Rice" },
  };
  const newer = {
    ...first,
    updatedAt: "2026-01-01T00:00:01.000Z",
    fields: { createdBy: actor.uuid, name: "Brown rice" },
  };

  assert.deepEqual(await repository.pushSyncRows(actor, [first]), {
    accepted: [first.uuid],
    rejected: [],
  });
  assert.deepEqual(await repository.pushSyncRows(actor, [newer]), {
    accepted: [newer.uuid],
    rejected: [],
  });
  assert.deepEqual(await repository.pullSyncRows(actor, null), [newer]);
  assert.deepEqual(await repository.pushSyncRows(actor, [first]), {
    accepted: [first.uuid],
    rejected: [],
  });
  assert.deepEqual(await repository.pullSyncRows(actor, "2026-01-01T00:00:00.500Z"), [
    newer,
  ]);
});

test("rejects client attempts to set server-owned attribution", async () => {
  const repository = new InMemoryRepository();
  const result = await repository.pushSyncRows(actor, [
    {
      table: "product",
      uuid: "22222222-2222-4222-8222-222222222222",
      updatedAt: "2026-01-01T00:00:00.000Z",
      archivedAt: null,
      fields: { createdBy: "different-actor" },
    },
  ]);
  assert.deepEqual(result.rejected[0], {
    uuid: "22222222-2222-4222-8222-222222222222",
    reason: "createdBy is server-owned.",
  });
});
