import test from "node:test";
import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { createApiServer } from "../src/http.js";
import { InMemoryRepository } from "../src/repository.js";
import type { AuthenticatedActor } from "../src/types.js";

const businessUuid = "11111111-1111-4111-8111-111111111111";
const customer: AuthenticatedActor = {
  uuid: "33333333-3333-4333-8333-333333333333",
  role: "customer",
};
const businessOwner: AuthenticatedActor = {
  uuid: "44444444-4444-4444-8444-444444444444",
  role: "business",
};
const otherCustomer: AuthenticatedActor = {
  uuid: "55555555-5555-4555-8555-555555555555",
  role: "customer",
};

async function withServer(
  callback: (port: number) => Promise<void>,
): Promise<void> {
  const repository = new InMemoryRepository();
  repository.businesses.push({
    uuid: businessUuid,
    ownerUuid: businessOwner.uuid,
    name: "Baybay Market",
    serviceArea: "Baybay City",
    verifiedAt: new Date().toISOString(),
    archivedAt: null,
  });
  const product = await repository.createProduct(
    businessUuid,
    {
      name: "Rice",
      category: "Staples",
      unitLabel: "kg",
      price: 55,
      isAvailable: true,
    },
    businessOwner,
  );
  const actors = new Map([
    ["customer-token", customer],
    ["business-token", businessOwner],
    ["other-token", otherCustomer],
  ]);
  const server = createApiServer({
    repository,
    verifier: {
      verifyAccessToken: async (token) => actors.get(token) ?? null,
    },
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  try {
    await callback(address.port);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
  assert.equal(product.price, 55);
}

function call(
  port: number,
  method: string,
  path: string,
  token?: string,
  data?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: "127.0.0.1", port, method, path, headers: { "content-type": "application/json" } },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>,
          }),
        );
      },
    );
    request.on("error", reject);
    if (token) {
      request.setHeader("authorization", `Bearer ${token}`);
    }
    if (data !== undefined) {
      request.write(JSON.stringify(data));
    }
    request.end();
  });
}

test("serves public discovery and protects order access", async () => {
  await withServer(async (port) => {
    const businesses = await call(port, "GET", "/v1/businesses");
    assert.equal(businesses.status, 200);
    assert.equal((businesses.body.data as unknown[]).length, 1);
    const products = await call(
      port,
      "GET",
      `/v1/businesses/${businessUuid}/products`,
    );
    const productUuid = (products.body.data as Array<{ uuid: string }>)[0]?.uuid;
    assert.ok(productUuid);

    const order = await call(
      port,
      "POST",
      "/v1/orders",
      "customer-token",
      {
        businessUuid,
        fulfillmentMethod: "delivery",
        deliveryArea: "Baybay City",
        privateDeliveryDetails: "Exact address",
        lines: [
          {
            productUuid,
            quantity: 2,
          },
        ],
      },
    );
    assert.equal(order.status, 201);
    const orderData = order.body.data as {
      uuid: string;
      totalAmount: number;
      lines: Array<{ productNameSnapshot: string; unitPriceSnapshot: number }>;
    };
    assert.equal(orderData.totalAmount, 110);
    assert.equal(orderData.lines[0]?.productNameSnapshot, "Rice");
    assert.equal(orderData.lines[0]?.unitPriceSnapshot, 55);

    const forbidden = await call(
      port,
      "GET",
      `/v1/orders/${orderData.uuid}`,
      "other-token",
    );
    assert.equal(forbidden.status, 403);

    const authorized = await call(
      port,
      "GET",
      `/v1/orders/${orderData.uuid}`,
      "customer-token",
    );
    assert.equal(authorized.status, 200);
    assert.equal(
      (authorized.body.data as { privateDeliveryDetails?: string }).privateDeliveryDetails,
      "Exact address",
    );

    const cancelled = await call(
      port,
      "PATCH",
      `/v1/orders/${orderData.uuid}/status`,
      "customer-token",
      { status: "cancelled" },
    );
    assert.equal(cancelled.status, 200);
  });
});
