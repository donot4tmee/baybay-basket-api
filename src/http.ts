import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { authenticateRequest, type AccessTokenVerifier } from "./auth.js";
import { ApiError } from "./errors.js";
import type { ApiRepository, OrderRecord, ReportRecord, SyncRow } from "./domain.js";
import { ApiService } from "./service.js";
import type { AuthenticatedActor } from "./types.js";

const maxBodyBytes = 1_000_000;

export interface ApiHttpDependencies {
  repository: ApiRepository;
  verifier: AccessTokenVerifier;
}

function send(
  response: ServerResponse,
  status: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function success(data: unknown): Record<string, unknown> {
  return { data };
}

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBodyBytes) {
      throw new ApiError("VALIDATION_ERROR", "Request body is too large.");
    }
    chunks.push(buffer);
  }
  if (length === 0) {
    return {};
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
  }
}

function actorFromRequest(
  request: IncomingMessage,
  verifier: AccessTokenVerifier,
): Promise<AuthenticatedActor> {
  const header = request.headers.authorization;
  return authenticateRequest(
    Array.isArray(header) ? header[0] : header,
    verifier,
  );
}

function statusFor(error: ApiError): number {
  if (error.code === "UNAUTHORIZED") return 401;
  if (error.code === "FORBIDDEN") return 403;
  return 400;
}

function requiredSegment(segments: string[], index: number): string {
  const value = segments[index];
  if (!value) {
    throw new ApiError("VALIDATION_ERROR", "The route is incomplete.");
  }
  return value;
}

export async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: ApiHttpDependencies,
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const segments = url.pathname.split("/").filter(Boolean);
    const service = new ApiService(dependencies.repository);
    const method = request.method ?? "GET";

    if (method === "GET" && url.pathname === "/health") {
      send(response, 200, success({ status: "ok" }));
      return;
    }
    if (method === "GET" && url.pathname === "/v1/businesses") {
      send(response, 200, success(await service.listBusinesses()));
      return;
    }
    if (
      method === "GET" &&
      segments.length === 4 &&
      segments[0] === "v1" &&
      segments[1] === "businesses" &&
      segments[3] === "products"
    ) {
      send(
        response,
        200,
        success(await service.listProducts(requiredSegment(segments, 2))),
      );
      return;
    }

    const actor = await actorFromRequest(request, dependencies.verifier);
    const requestBody = method === "GET" ? {} : await body(request);

    if (
      method === "POST" &&
      segments.length === 4 &&
      segments[0] === "v1" &&
      segments[1] === "businesses" &&
      segments[3] === "products"
    ) {
      send(
        response,
        201,
        success(
          await service.createProduct(
            actor,
            requiredSegment(segments, 2),
            requestBody,
          ),
        ),
      );
      return;
    }
    if (method === "POST" && url.pathname === "/v1/orders") {
      send(response, 201, success(await service.createOrder(actor, requestBody)));
      return;
    }
    if (
      method === "PATCH" &&
      segments.length === 3 &&
      segments[0] === "v1" &&
      segments[1] === "products"
    ) {
      send(
        response,
        200,
        success(
          await service.updateProduct(
            actor,
            requiredSegment(segments, 2),
            requestBody,
          ),
        ),
      );
      return;
    }
    if (
      method === "DELETE" &&
      segments.length === 3 &&
      segments[0] === "v1" &&
      segments[1] === "products"
    ) {
      send(
        response,
        200,
        success(
          await service.archiveProduct(actor, requiredSegment(segments, 2)),
        ),
      );
      return;
    }
    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[0] === "v1" &&
      segments[1] === "orders"
    ) {
      const order = await service.getOrder(actor, requiredSegment(segments, 2));
      send(response, 200, success(order));
      return;
    }
    if (
      method === "PATCH" &&
      segments.length === 4 &&
      segments[0] === "v1" &&
      segments[1] === "orders" &&
      segments[3] === "status"
    ) {
      if (
        typeof requestBody !== "object" ||
        requestBody === null ||
        typeof (requestBody as { status?: unknown }).status !== "string"
      ) {
        throw new ApiError("VALIDATION_ERROR", "A status is required.");
      }
      send(
        response,
        200,
        success(
          await service.updateOrderStatus(
            actor,
            requiredSegment(segments, 2),
            (requestBody as { status: OrderRecord["status"] }).status,
          ),
        ),
      );
      return;
    }
    if (method === "POST" && url.pathname === "/v1/reports") {
      send(response, 201, success(await service.createReport(actor, requestBody)));
      return;
    }
    if (
      method === "PATCH" &&
      segments.length === 4 &&
      segments[0] === "v1" &&
      segments[1] === "reports" &&
      segments[3] === "status"
    ) {
      if (
        typeof requestBody !== "object" ||
        requestBody === null ||
        typeof (requestBody as { status?: unknown }).status !== "string"
      ) {
        throw new ApiError("VALIDATION_ERROR", "A status is required.");
      }
      send(
        response,
        200,
        success(
          await service.updateReportStatus(
            actor,
            requiredSegment(segments, 2),
            (requestBody as { status: ReportRecord["status"] }).status,
          ),
        ),
      );
      return;
    }
    if (method === "POST" && url.pathname === "/v1/sync/push") {
      if (
        typeof requestBody !== "object" ||
        requestBody === null ||
        !Array.isArray((requestBody as { rows?: unknown }).rows)
      ) {
        throw new ApiError("VALIDATION_ERROR", "Sync rows are required.");
      }
      send(
        response,
        200,
        success(
          await dependencies.repository.pushSyncRows(
            actor,
            (requestBody as { rows: SyncRow[] }).rows,
          ),
        ),
      );
      return;
    }
    if (method === "GET" && url.pathname === "/v1/sync/pull") {
      send(
        response,
        200,
        success(
          await dependencies.repository.pullSyncRows(
            actor,
            url.searchParams.get("since"),
          ),
        ),
      );
      return;
    }

    send(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      send(response, statusFor(error), {
        error: { code: error.code, message: error.message, details: error.details },
      });
      return;
    }
    send(response, 500, {
      error: { code: "INTERNAL_ERROR", message: "An internal error occurred." },
    });
  }
}

export function createApiServer(dependencies: ApiHttpDependencies) {
  return createServer((request, response) => {
    void handleRequest(request, response, dependencies);
  });
}
