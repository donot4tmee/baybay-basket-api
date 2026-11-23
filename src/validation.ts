import { validationError } from "./errors.js";
import type { OrderInput, ProductInput } from "./types.js";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertObject(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw validationError("The request body must be an object.");
  }
}

function assertKnownFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): void {
  const unknownField = Object.keys(value).find((key) => !fields.includes(key));
  if (unknownField) {
    throw validationError(`Unknown request field: ${unknownField}.`);
  }
}

function requiredString(
  value: unknown,
  field: string,
  maxLength = 255,
): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw validationError(`${field} is required.`);
  }
  if (value.trim().length > maxLength) {
    throw validationError(`${field} is too long.`);
  }
  return value.trim();
}

function optionalString(
  value: unknown,
  field: string,
  maxLength = 255,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredString(value, field, maxLength);
}

function uuid(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (!uuidPattern.test(result)) {
    throw validationError(`${field} must be a UUID.`);
  }
  return result;
}

function numberValue(
  value: unknown,
  field: string,
  predicate: (value: number) => boolean,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !predicate(value)) {
    throw validationError(`${field} is invalid.`);
  }
  return value;
}

export function validateProductInput(value: unknown): ProductInput {
  assertObject(value);
  assertKnownFields(value, [
    "name",
    "description",
    "category",
    "unitLabel",
    "price",
    "availableQuantity",
    "isAvailable",
  ]);

  const description = optionalString(value.description, "description", 2000);
  const availableQuantity =
    value.availableQuantity === undefined
      ? undefined
      : numberValue(value.availableQuantity, "availableQuantity", (item) => item >= 0);

  return {
    name: requiredString(value.name, "name"),
    ...(description === undefined ? {} : { description }),
    category: requiredString(value.category, "category"),
    unitLabel: requiredString(value.unitLabel, "unitLabel"),
    price: numberValue(value.price, "price", (item) => item >= 0),
    ...(availableQuantity === undefined ? {} : { availableQuantity }),
    ...(value.isAvailable === undefined
      ? {}
      : {
          isAvailable:
            typeof value.isAvailable === "boolean"
              ? value.isAvailable
              : (() => {
                  throw validationError("isAvailable is invalid.");
                })(),
        }),
  };
}

export function validateOrderInput(value: unknown): OrderInput {
  assertObject(value);
  assertKnownFields(value, [
    "businessUuid",
    "fulfillmentMethod",
    "deliveryArea",
    "privateDeliveryDetails",
    "lines",
  ]);

  if (!Array.isArray(value.lines) || value.lines.length === 0) {
    throw validationError("At least one order line is required.");
  }

  const lines = value.lines.map((line, index) => {
    assertObject(line);
    assertKnownFields(line, ["productUuid", "quantity"]);
    return {
      productUuid: uuid(line.productUuid, `lines[${index}].productUuid`),
      quantity: numberValue(
        line.quantity,
        `lines[${index}].quantity`,
        (item) => item > 0,
      ),
    };
  });

  const fulfillmentMethod = value.fulfillmentMethod;
  if (fulfillmentMethod !== "pickup" && fulfillmentMethod !== "delivery") {
    throw validationError("fulfillmentMethod must be pickup or delivery.");
  }

  const deliveryArea = optionalString(value.deliveryArea, "deliveryArea");
  const privateDeliveryDetails = optionalString(
    value.privateDeliveryDetails,
    "privateDeliveryDetails",
    2000,
  );
  if (
    fulfillmentMethod === "delivery" &&
    (deliveryArea === undefined || privateDeliveryDetails === undefined)
  ) {
    throw validationError(
      "Delivery orders require a service area and private delivery details.",
    );
  }

  return {
    businessUuid: uuid(value.businessUuid, "businessUuid"),
    fulfillmentMethod,
    ...(deliveryArea === undefined ? {} : { deliveryArea }),
    ...(privateDeliveryDetails === undefined ? {} : { privateDeliveryDetails }),
    lines,
  };
}
