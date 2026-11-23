import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "../src/errors.js";
import {
  validateOrderInput,
  validateProductInput,
} from "../src/validation.js";

const businessUuid = "11111111-1111-4111-8111-111111111111";
const productUuid = "22222222-2222-4222-8222-222222222222";

test("validates a product and rejects unknown fields", () => {
  assert.deepEqual(
    validateProductInput({
      name: "Rice",
      category: "Staples",
      unitLabel: "kg",
      price: 55,
      isAvailable: true,
    }),
    {
      name: "Rice",
      category: "Staples",
      unitLabel: "kg",
      price: 55,
      isAvailable: true,
    },
  );
  assert.throws(
    () =>
      validateProductInput({
        name: "Rice",
        category: "Staples",
        unitLabel: "kg",
        price: 55,
        archivedAt: null,
      }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );
});

test("requires private delivery details and validates order lines", () => {
  assert.throws(
    () =>
      validateOrderInput({
        businessUuid,
        fulfillmentMethod: "delivery",
        deliveryArea: "Baybay",
        lines: [{ productUuid, quantity: 1 }],
      }),
    (error: unknown) =>
      error instanceof ApiError && error.code === "VALIDATION_ERROR",
  );

  assert.deepEqual(
    validateOrderInput({
      businessUuid,
      fulfillmentMethod: "delivery",
      deliveryArea: "Baybay",
      privateDeliveryDetails: "Exact address",
      lines: [{ productUuid, quantity: 2 }],
    }).lines,
    [{ productUuid, quantity: 2 }],
  );
});
