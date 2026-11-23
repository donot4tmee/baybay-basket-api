import { requireBusinessOwnership, requireRole } from "./authorization.js";
import { ApiError } from "./errors.js";
import type {
  ApiRepository,
  OrderRecord,
  ProductRecord,
  ReportRecord,
} from "./domain.js";
import { orderStatuses } from "./domain.js";
import type {
  AuthenticatedActor,
  OrderInput,
  ProductInput,
} from "./types.js";
import { validateOrderInput, validateProductInput } from "./validation.js";

export class ApiService {
  public constructor(private readonly repository: ApiRepository) {}

  public listBusinesses() {
    return this.repository.listBusinesses();
  }

  public listProducts(businessUuid: string) {
    return this.repository.listProducts(businessUuid);
  }

  public async createProduct(
    actor: AuthenticatedActor,
    businessUuid: string,
    body: unknown,
  ): Promise<ProductRecord> {
    const business = await this.repository.getBusiness(businessUuid);
    if (!business || business.archivedAt !== null || business.verifiedAt === null) {
      throw new ApiError("VALIDATION_ERROR", "The business is not available.");
    }
    requireBusinessOwnership(actor, business.ownerUuid);
    return this.repository.createProduct(
      businessUuid,
      validateProductInput(body),
      actor,
    );
  }

  public async createOrder(
    actor: AuthenticatedActor,
    body: unknown,
  ): Promise<OrderRecord> {
    requireRole(actor, "customer", "platform_admin", "system_admin");
    return this.repository.createOrder(validateOrderInput(body), actor.uuid);
  }

  public async updateProduct(
    actor: AuthenticatedActor,
    productUuid: string,
    body: unknown,
  ): Promise<ProductRecord> {
    const product = await this.repository.getProduct(productUuid);
    if (!product) {
      throw new ApiError("VALIDATION_ERROR", "Product was not found.");
    }
    const business = await this.repository.getBusiness(product.businessUuid);
    if (!business) {
      throw new ApiError("VALIDATION_ERROR", "The business was not found.");
    }
    requireBusinessOwnership(actor, business.ownerUuid);
    return this.repository.updateProduct(
      productUuid,
      validateProductInput(body),
      actor,
    );
  }

  public async archiveProduct(
    actor: AuthenticatedActor,
    productUuid: string,
  ): Promise<ProductRecord> {
    const product = await this.repository.getProduct(productUuid);
    if (!product) {
      throw new ApiError("VALIDATION_ERROR", "Product was not found.");
    }
    const business = await this.repository.getBusiness(product.businessUuid);
    if (!business) {
      throw new ApiError("VALIDATION_ERROR", "The business was not found.");
    }
    requireBusinessOwnership(actor, business.ownerUuid);
    return this.repository.archiveProduct(productUuid, actor);
  }

  public async getOrder(
    actor: AuthenticatedActor,
    orderUuid: string,
  ): Promise<OrderRecord> {
    const order = await this.repository.getOrder(orderUuid);
    if (!order) {
      throw new ApiError("VALIDATION_ERROR", "Order was not found.");
    }
    if (actor.role === "customer" && actor.uuid !== order.customerUuid) {
      throw new ApiError("FORBIDDEN", "The actor cannot access this order.");
    }
    if (actor.role === "business") {
      const business = await this.repository.getBusiness(order.businessUuid);
      if (!business || business.ownerUuid !== actor.uuid) {
        throw new ApiError("FORBIDDEN", "The actor cannot access this order.");
      }
    }
    requireRole(actor, "customer", "business", "platform_admin", "system_admin");
    return order;
  }

  public async updateOrderStatus(
    actor: AuthenticatedActor,
    orderUuid: string,
    status: OrderRecord["status"],
  ): Promise<OrderRecord> {
    if (!orderStatuses.includes(status)) {
      throw new ApiError("VALIDATION_ERROR", "The order status is invalid.");
    }
    const order = await this.repository.getOrder(orderUuid);
    if (!order) {
      throw new ApiError("VALIDATION_ERROR", "Order was not found.");
    }
    if (actor.role === "customer") {
      if (actor.uuid !== order.customerUuid || status !== "cancelled") {
        throw new ApiError("FORBIDDEN", "The customer can only cancel its own order.");
      }
    } else {
      const business = await this.repository.getBusiness(order.businessUuid);
      if (!business) {
        throw new ApiError("VALIDATION_ERROR", "The business was not found.");
      }
      requireBusinessOwnership(actor, business.ownerUuid);
    }
    return this.repository.updateOrderStatus(orderUuid, status, actor);
  }

  public async createReport(
    actor: AuthenticatedActor,
    body: unknown,
  ): Promise<ReportRecord> {
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      typeof (body as { targetUuid?: unknown }).targetUuid !== "string" ||
      typeof (body as { targetType?: unknown }).targetType !== "string" ||
      typeof (body as { reason?: unknown }).reason !== "string"
    ) {
      throw new ApiError("VALIDATION_ERROR", "A report target and reason are required.");
    }
    const targetType = (body as { targetType: string }).targetType;
    if (targetType !== "business" && targetType !== "product") {
      throw new ApiError("VALIDATION_ERROR", "The report target type is invalid.");
    }
    const reason = (body as { reason: string }).reason.trim();
    if (reason.length === 0 || reason.length > 2000) {
      throw new ApiError("VALIDATION_ERROR", "The report reason is invalid.");
    }
    return this.repository.createReport(
      (body as { targetUuid: string }).targetUuid,
      targetType,
      reason,
      actor.uuid,
    );
  }

  public async updateReportStatus(
    actor: AuthenticatedActor,
    reportUuid: string,
    status: ReportRecord["status"],
  ): Promise<ReportRecord> {
    requireRole(actor, "platform_admin", "system_admin");
    return this.repository.updateReportStatus(reportUuid, status);
  }
}
