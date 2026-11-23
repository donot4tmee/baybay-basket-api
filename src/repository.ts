import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import {
  statusTransitions,
  type ApiRepository,
  type BusinessRecord,
  type OrderRecord,
  type ProductRecord,
  type ReportRecord,
  type SyncPushResult,
  type SyncRow,
} from "./domain.js";
import type {
  AuthenticatedActor,
  OrderInput,
  ProductInput,
} from "./types.js";

export class InMemoryRepository implements ApiRepository {
  public readonly businesses: BusinessRecord[] = [];
  public readonly products: ProductRecord[] = [];
  public readonly orders: OrderRecord[] = [];
  public readonly reports: ReportRecord[] = [];
  private readonly syncRows = new Map<string, SyncRow>();

  public async listBusinesses(): Promise<BusinessRecord[]> {
    return this.businesses.filter((item) => item.archivedAt === null && item.verifiedAt !== null);
  }

  public async listProducts(businessUuid: string): Promise<ProductRecord[]> {
    return this.products.filter(
      (item) => item.businessUuid === businessUuid && item.archivedAt === null,
    );
  }

  public async getBusiness(uuid: string): Promise<BusinessRecord | null> {
    return this.businesses.find((item) => item.uuid === uuid) ?? null;
  }

  public async getProduct(uuid: string): Promise<ProductRecord | null> {
    return this.products.find((item) => item.uuid === uuid) ?? null;
  }

  public async createProduct(
    businessUuid: string,
    input: ProductInput,
    _actor: AuthenticatedActor,
  ): Promise<ProductRecord> {
    const product: ProductRecord = {
      ...input,
      uuid: randomUUID(),
      businessUuid,
      archivedAt: null,
      updatedAt: new Date().toISOString(),
    };
    this.products.push(product);
    return product;
  }

  public async updateProduct(
    productUuid: string,
    input: ProductInput,
    _actor: AuthenticatedActor,
  ): Promise<ProductRecord> {
    const product = await this.getProduct(productUuid);
    if (!product || product.archivedAt !== null) {
      throw new ApiError("VALIDATION_ERROR", "Product was not found.");
    }
    Object.assign(product, input, { updatedAt: new Date().toISOString() });
    return product;
  }

  public async archiveProduct(
    productUuid: string,
    _actor: AuthenticatedActor,
  ): Promise<ProductRecord> {
    const product = await this.getProduct(productUuid);
    if (!product || product.archivedAt !== null) {
      throw new ApiError("VALIDATION_ERROR", "Product was not found.");
    }
    product.archivedAt = new Date().toISOString();
    product.updatedAt = product.archivedAt;
    return product;
  }

  public async createOrder(
    input: OrderInput,
    customerUuid: string,
  ): Promise<OrderRecord> {
    const products = await Promise.all(input.lines.map((line) => this.getProduct(line.productUuid)));
    if (products.some((product) => product === null)) {
      throw new ApiError("VALIDATION_ERROR", "Every ordered product must exist.");
    }
    if (products.some((product) => product?.businessUuid !== input.businessUuid)) {
      throw new ApiError("VALIDATION_ERROR", "All products must belong to one business.");
    }
    if (products.some((product) => product?.archivedAt !== null || product?.isAvailable === false)) {
      throw new ApiError("VALIDATION_ERROR", "Every ordered product must be available.");
    }

    const lines = input.lines.map((line, index) => {
      const product = products[index];
      if (!product) {
        throw new ApiError("VALIDATION_ERROR", "Every ordered product must exist.");
      }
      const lineTotal = product.price * line.quantity;
      return {
        uuid: randomUUID(),
        productUuid: product.uuid,
        productNameSnapshot: product.name,
        unitLabelSnapshot: product.unitLabel,
        unitPriceSnapshot: product.price,
        quantity: line.quantity,
        lineTotal,
      };
    });

    const order: OrderRecord = {
      uuid: randomUUID(),
      customerUuid,
      businessUuid: input.businessUuid,
      fulfillmentMethod: input.fulfillmentMethod,
      deliveryArea: input.deliveryArea ?? null,
      privateDeliveryDetails: input.privateDeliveryDetails ?? null,
      status: "submitted",
      lines,
      totalAmount: lines.reduce((total, line) => total + line.lineTotal, 0),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    };
    this.orders.push(order);
    return order;
  }

  public async getOrder(uuid: string): Promise<OrderRecord | null> {
    return this.orders.find((item) => item.uuid === uuid && item.archivedAt === null) ?? null;
  }

  public async updateOrderStatus(
    uuid: string,
    status: OrderRecord["status"],
    _actor: AuthenticatedActor,
  ): Promise<OrderRecord> {
    const order = await this.getOrder(uuid);
    if (!order) {
      throw new ApiError("VALIDATION_ERROR", "Order was not found.");
    }
    if (!statusTransitions[order.status].includes(status)) {
      throw new ApiError("VALIDATION_ERROR", `Cannot change order from ${order.status} to ${status}.`);
    }
    order.status = status;
    order.updatedAt = new Date().toISOString();
    return order;
  }

  public async createReport(
    targetUuid: string,
    targetType: ReportRecord["targetType"],
    reason: string,
    reporterUuid: string,
  ): Promise<ReportRecord> {
    const report: ReportRecord = {
      uuid: randomUUID(),
      reporterUuid,
      targetUuid,
      targetType,
      reason,
      status: "open",
    };
    this.reports.push(report);
    return report;
  }

  public async updateReportStatus(
    uuid: string,
    status: ReportRecord["status"],
  ): Promise<ReportRecord> {
    const report = this.reports.find((item) => item.uuid === uuid);
    if (!report) {
      throw new ApiError("VALIDATION_ERROR", "Report was not found.");
    }
    report.status = status;
    return report;
  }

  public async pushSyncRows(
    actor: AuthenticatedActor,
    rows: SyncRow[],
  ): Promise<SyncPushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ uuid: string; reason: string }> = [];
    for (const row of rows) {
      const key = `${row.table}:${row.uuid}`;
      const existing = this.syncRows.get(key);
      if (row.fields.createdBy !== undefined && row.fields.createdBy !== actor.uuid) {
        rejected.push({ uuid: row.uuid, reason: "createdBy is server-owned." });
        continue;
      }
      if (
        existing &&
        existing.updatedAt &&
        row.updatedAt &&
        existing.updatedAt >= row.updatedAt &&
        !(row.archivedAt && existing.archivedAt === null && existing.updatedAt <= row.updatedAt)
      ) {
        accepted.push(row.uuid);
        continue;
      }
      this.syncRows.set(key, row);
      accepted.push(row.uuid);
    }
    return { accepted, rejected };
  }

  public async pullSyncRows(
    _actor: AuthenticatedActor,
    since: string | null,
  ): Promise<SyncRow[]> {
    return [...this.syncRows.values()].filter(
      (row) => since === null || (row.updatedAt !== null && row.updatedAt > since),
    );
  }
}
