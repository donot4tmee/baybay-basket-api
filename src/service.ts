import { requireBusinessOwnership, requireRole } from "./authorization.js";
import { ApiError } from "./errors.js";
import type {
  ApiRepository,
  AggregateRecord,
  BusinessRecord,
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
import {
  validateBusinessInput,
  validateCategoryInput,
  validateOrderInput,
  validateProductInput,
} from "./validation.js";

export class ApiService {
  public constructor(private readonly repository: ApiRepository) {}

  public listBusinesses() {
    return this.repository.listBusinesses();
  }

  public listProducts(businessUuid: string) {
    return this.repository.listProducts(businessUuid);
  }

  public async updateBusiness(
    actor: AuthenticatedActor,
    businessUuid: string,
    body: unknown,
  ): Promise<BusinessRecord> {
    const business = await this.repository.getBusiness(businessUuid);
    if (!business) {
      throw new ApiError("VALIDATION_ERROR", "Business was not found.");
    }
    requireBusinessOwnership(actor, business.ownerUuid);
    return this.repository.updateBusiness(
      businessUuid,
      validateBusinessInput(body),
      actor,
    );
  }

  public async verifyBusiness(
    actor: AuthenticatedActor,
    businessUuid: string,
  ): Promise<BusinessRecord> {
    requireRole(actor, "platform_admin", "system_admin");
    return this.repository.verifyBusiness(businessUuid, actor);
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

  public async listOrders(actor: AuthenticatedActor): Promise<OrderRecord[]> {
    const orders = await this.repository.listOrders();
    if (actor.role === "platform_admin" || actor.role === "system_admin") {
      return orders;
    }
    if (actor.role === "customer") {
      return orders.filter((order) => order.customerUuid === actor.uuid);
    }
    if (actor.role === "business") {
      const ownedOrders = await Promise.all(
        orders.map(async (order) => {
          const business = await this.repository.getBusiness(order.businessUuid);
          return business?.ownerUuid === actor.uuid ? order : null;
        }),
      );
      return ownedOrders.filter((order): order is OrderRecord => order !== null);
    }
    throw new ApiError("FORBIDDEN", "The actor cannot access orders.");
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

  public async listReports(actor: AuthenticatedActor): Promise<ReportRecord[]> {
    requireRole(actor, "platform_admin", "system_admin");
    return this.repository.listReports();
  }

  public async listCategories(actor: AuthenticatedActor) {
    requireRole(actor, "platform_admin", "system_admin");
    return this.repository.listCategories();
  }

  public async createCategory(actor: AuthenticatedActor, body: unknown) {
    requireRole(actor, "platform_admin", "system_admin");
    return this.repository.createCategory(validateCategoryInput(body));
  }

  public async productCategoryCounts(
    actor: AuthenticatedActor,
    minimumGroupSize = 5,
  ): Promise<AggregateRecord[]> {
    requireRole(actor, "platform_admin", "system_admin");
    return (await this.repository.productCategoryCounts()).filter(
      (item) => item.count >= minimumGroupSize,
    );
  }
}
