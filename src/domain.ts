import type { AuthenticatedActor, OrderInput, ProductInput, Role } from "./types.js";

export type OrderStatus =
  | "submitted"
  | "accepted"
  | "rejected"
  | "preparing"
  | "ready"
  | "completed"
  | "cancelled";

export const orderStatuses: readonly OrderStatus[] = [
  "submitted",
  "accepted",
  "rejected",
  "preparing",
  "ready",
  "completed",
  "cancelled",
];

export interface BusinessRecord {
  uuid: string;
  ownerUuid: string;
  name: string;
  serviceArea: string;
  verifiedAt: string | null;
  archivedAt: string | null;
}

export interface BusinessUpdateInput {
  name: string;
  description?: string;
  serviceArea: string;
  contactText?: string;
}

export interface CategoryRecord {
  uuid: string;
  name: string;
  archivedAt: string | null;
}

export interface AggregateRecord {
  name: string;
  count: number;
}

export interface ProductRecord extends ProductInput {
  uuid: string;
  businessUuid: string;
  archivedAt: string | null;
  updatedAt: string;
}

export interface OrderLineRecord {
  uuid: string;
  productUuid: string;
  productNameSnapshot: string;
  unitLabelSnapshot: string;
  unitPriceSnapshot: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderRecord {
  uuid: string;
  customerUuid: string;
  businessUuid: string;
  fulfillmentMethod: "pickup" | "delivery";
  deliveryArea: string | null;
  privateDeliveryDetails: string | null;
  status: OrderStatus;
  lines: OrderLineRecord[];
  totalAmount: number;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ReportRecord {
  uuid: string;
  reporterUuid: string;
  targetUuid: string;
  targetType: "business" | "product";
  reason: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
}

export interface SyncRow {
  table: string;
  uuid: string;
  updatedAt: string | null;
  archivedAt: string | null;
  fields: Record<string, unknown>;
}

export interface SyncPushResult {
  accepted: string[];
  rejected: Array<{ uuid: string; reason: string }>;
}

export interface AppConfiguration {
  name: string;
  value: string;
  updatedAt: string | null;
}

export interface ApiRepository {
  listBusinesses(): Promise<BusinessRecord[]>;
  listProducts(businessUuid: string): Promise<ProductRecord[]>;
  getBusiness(businessUuid: string): Promise<BusinessRecord | null>;
  updateBusiness(
    businessUuid: string,
    input: BusinessUpdateInput,
    actor: AuthenticatedActor,
  ): Promise<BusinessRecord>;
  verifyBusiness(
    businessUuid: string,
    actor: AuthenticatedActor,
  ): Promise<BusinessRecord>;
  getProduct(productUuid: string): Promise<ProductRecord | null>;
  createProduct(
    businessUuid: string,
    input: ProductInput,
    actor: AuthenticatedActor,
  ): Promise<ProductRecord>;
  updateProduct(
    productUuid: string,
    input: ProductInput,
    actor: AuthenticatedActor,
  ): Promise<ProductRecord>;
  archiveProduct(
    productUuid: string,
    actor: AuthenticatedActor,
  ): Promise<ProductRecord>;
  createOrder(
    input: OrderInput,
    customerUuid: string,
  ): Promise<OrderRecord>;
  getOrder(orderUuid: string): Promise<OrderRecord | null>;
  listOrders(): Promise<OrderRecord[]>;
  updateOrderStatus(
    orderUuid: string,
    status: OrderStatus,
    actor: AuthenticatedActor,
  ): Promise<OrderRecord>;
  createReport(
    targetUuid: string,
    targetType: "business" | "product",
    reason: string,
    reporterUuid: string,
  ): Promise<ReportRecord>;
  updateReportStatus(
    reportUuid: string,
    status: ReportRecord["status"],
  ): Promise<ReportRecord>;
  listReports(): Promise<ReportRecord[]>;
  listCategories(): Promise<CategoryRecord[]>;
  createCategory(name: string): Promise<CategoryRecord>;
  productCategoryCounts(): Promise<AggregateRecord[]>;
  listConfiguration(): Promise<AppConfiguration[]>;
  setConfiguration(name: string, value: string): Promise<AppConfiguration>;
  runRetention(cutoffIso: string): Promise<{ archivedAccounts: number; archivedOrders: number }>;
  backupSnapshot(): Promise<Record<string, unknown>>;
  pushSyncRows(actor: AuthenticatedActor, rows: SyncRow[]): Promise<SyncPushResult>;
  pullSyncRows(actor: AuthenticatedActor, since: string | null): Promise<SyncRow[]>;
}

export const statusTransitions: Record<OrderStatus, readonly OrderStatus[]> = {
  submitted: ["accepted", "rejected", "cancelled"],
  accepted: ["preparing"],
  rejected: [],
  preparing: ["ready"],
  ready: ["completed"],
  completed: [],
  cancelled: [],
};

export const administratorRoles: readonly Role[] = [
  "system_admin",
  "platform_admin",
];
