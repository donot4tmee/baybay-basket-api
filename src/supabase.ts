import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccessTokenVerifier } from "./auth.js";
import type { AuthenticatedActor, Role } from "./types.js";
import { randomUUID } from "node:crypto";
import { ApiError } from "./errors.js";
import { statusTransitions, type ApiRepository, type AppConfiguration, type AggregateRecord, type BusinessRecord, type BusinessUpdateInput, type CategoryRecord, type OrderRecord, type OrderStatus, type ProductRecord, type ReportRecord, type SyncPushResult, type SyncRow } from "./domain.js";

export interface SupabaseDatabase {
  public: {
    Tables: {
      account: {
        Row: {
          uuid: string;
          auth_user_uuid: string | null;
          email: string;
          role: Role;
          archived_at: string | null;
        };
        Insert: {
          uuid?: string;
          auth_user_uuid?: string | null;
          email: string;
          role?: Role;
          archived_at?: string | null;
        };
        Update: Partial<{
          uuid: string;
          auth_user_uuid: string | null;
          email: string;
          role: Role;
          archived_at: string | null;
        }>;
        Relationships: [];
      };
      business: {
        Row: { uuid: string; owner_uuid: string; name: string; description: string | null; service_area: string; contact_text: string | null; verified_at: string | null; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { uuid?: string; owner_uuid: string; name: string; description?: string | null; service_area: string; contact_text?: string | null; verified_at?: string | null; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: Partial<{ owner_uuid: string; name: string; description: string | null; service_area: string; contact_text: string | null; verified_at: string | null; updated_at: string; archived_at: string | null }>;
        Relationships: [];
      };
      product: {
        Row: { uuid: string; business_uuid: string; name: string; description: string | null; category: string; unit_label: string; price: number; available_quantity: number | null; is_available: boolean; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { uuid?: string; business_uuid: string; name: string; description?: string | null; category: string; unit_label: string; price: number; available_quantity?: number | null; is_available?: boolean; created_by?: string | null; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: Partial<{ name: string; description: string | null; category: string; unit_label: string; price: number; available_quantity: number | null; is_available: boolean; updated_at: string; archived_at: string | null }>;
        Relationships: [];
      };
      customer_order: {
        Row: { uuid: string; customer_uuid: string; business_uuid: string; fulfillment_method: "pickup" | "delivery"; delivery_area: string | null; private_delivery_details: string | null; status: OrderStatus; total_amount: number; submitted_at: string; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { uuid?: string; customer_uuid: string; business_uuid: string; fulfillment_method: "pickup" | "delivery"; delivery_area?: string | null; private_delivery_details?: string | null; status?: OrderStatus; total_amount?: number; submitted_at?: string; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: Partial<{ fulfillment_method: "pickup" | "delivery"; delivery_area: string | null; private_delivery_details: string | null; status: OrderStatus; total_amount: number; updated_at: string; archived_at: string | null }>;
        Relationships: [];
      };
      order_line: {
        Row: { uuid: string; order_uuid: string; product_uuid: string; product_name_snapshot: string; unit_label_snapshot: string; unit_price_snapshot: number; quantity: number; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { uuid?: string; order_uuid: string; product_uuid: string; product_name_snapshot: string; unit_label_snapshot: string; unit_price_snapshot: number; quantity: number; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: Partial<{ quantity: number; updated_at: string; archived_at: string | null }>;
        Relationships: [];
      };
      content_report: {
        Row: { uuid: string; reporter_uuid: string; target_uuid: string; target_type: "business" | "product"; reason: string; status: "open" | "reviewing" | "resolved" | "dismissed"; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { uuid?: string; reporter_uuid: string; target_uuid: string; target_type: "business" | "product"; reason: string; status?: "open" | "reviewing" | "resolved" | "dismissed"; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: Partial<{ status: "open" | "reviewing" | "resolved" | "dismissed"; updated_at: string; archived_at: string | null }>;
        Relationships: [];
      };
      app_setting: {
        Row: { uuid: string; setting_name: string; setting_value: string; created_at: string; updated_at: string; archived_at: string | null };
        Insert: { uuid?: string; setting_name: string; setting_value: string; created_at?: string; updated_at?: string; archived_at?: string | null };
        Update: Partial<{ setting_value: string; updated_at: string; archived_at: string | null }>;
        Relationships: [];
      };
    };
      Views: Record<string, never>;
      Functions: Record<string, never>;
      Enums: Record<string, never>;
      CompositeTypes: Record<string, never>;
  };
}

export function createSupabaseClient(
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_ANON_KEY,
): SupabaseClient<SupabaseDatabase> {
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required.");
  }
  return createClient<SupabaseDatabase>(url, key);
}

export function createSupabaseServiceClient(
  url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SERVICE_ROLE_KEY,
): SupabaseClient<SupabaseDatabase> {
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  }
  return createClient<SupabaseDatabase>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export class SupabaseAccessTokenVerifier implements AccessTokenVerifier {
  public constructor(
    private readonly client: SupabaseClient<SupabaseDatabase>,
  ) {}

  public async verifyAccessToken(
    token: string,
  ): Promise<AuthenticatedActor | null> {
    const { data: authData, error: authError } =
      await this.client.auth.getUser(token);
    if (authError || !authData.user) {
      return null;
    }

    const { data: accountData, error: accountError } = await this.client
      .from("account")
      .select("uuid, auth_user_uuid, email, role, archived_at")
      .eq("auth_user_uuid", authData.user.id)
      .is("archived_at", null)
      .maybeSingle();
    const account = accountData as SupabaseDatabase["public"]["Tables"]["account"]["Row"] | null;
    if (accountError || !account) {
      return null;
    }
    return {
      uuid: account.uuid,
      role: account.role,
      email: account.email,
    };
  }
}

export class SupabaseRepository implements ApiRepository {
  public constructor(
    private readonly client: SupabaseClient<SupabaseDatabase>,
  ) {}

  public async listBusinesses(): Promise<BusinessRecord[]> {
    const { data, error } = await this.client
      .from("business")
      .select("uuid, owner_uuid, name, service_area, verified_at, archived_at")
      .is("archived_at", null)
      .not("verified_at", "is", null);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load businesses.");
    return (data ?? []).map((row) => ({
      uuid: row.uuid,
      ownerUuid: row.owner_uuid,
      name: row.name,
      serviceArea: row.service_area,
      verifiedAt: row.verified_at,
      archivedAt: row.archived_at,
    }));
  }

  public async listProducts(businessUuid: string): Promise<ProductRecord[]> {
    const { data, error } = await this.client
      .from("product")
      .select("*")
      .eq("business_uuid", businessUuid)
      .is("archived_at", null)
      .eq("is_available", true);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load products.");
    return (data ?? []).map((row) => this.mapProduct(row));
  }

  public async getBusiness(businessUuid: string): Promise<BusinessRecord | null> {
    const { data, error } = await this.client
      .from("business")
      .select("uuid, owner_uuid, name, service_area, verified_at, archived_at")
      .eq("uuid", businessUuid)
      .maybeSingle();
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load the business.");
    if (!data) return null;
    return {
      uuid: data.uuid,
      ownerUuid: data.owner_uuid,
      name: data.name,
      serviceArea: data.service_area,
      verifiedAt: data.verified_at,
      archivedAt: data.archived_at,
    };
  }

  public async updateBusiness(
    businessUuid: string,
    input: BusinessUpdateInput,
    _actor: AuthenticatedActor,
  ): Promise<BusinessRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("business")
      .update({
        name: input.name,
        description: input.description ?? null,
        service_area: input.serviceArea,
        contact_text: input.contactText ?? null,
        updated_at: now,
      })
      .eq("uuid", businessUuid)
      .is("archived_at", null)
      .select("uuid, owner_uuid, name, service_area, verified_at, archived_at")
      .maybeSingle();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to update the business.");
    return {
      uuid: data.uuid,
      ownerUuid: data.owner_uuid,
      name: data.name,
      serviceArea: data.service_area,
      verifiedAt: data.verified_at,
      archivedAt: data.archived_at,
    };
  }

  public async verifyBusiness(
    businessUuid: string,
    _actor: AuthenticatedActor,
  ): Promise<BusinessRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("business")
      .update({ verified_at: now, updated_at: now })
      .eq("uuid", businessUuid)
      .is("archived_at", null)
      .select("uuid, owner_uuid, name, service_area, verified_at, archived_at")
      .maybeSingle();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to verify the business.");
    return {
      uuid: data.uuid,
      ownerUuid: data.owner_uuid,
      name: data.name,
      serviceArea: data.service_area,
      verifiedAt: data.verified_at,
      archivedAt: data.archived_at,
    };
  }

  private mapProduct(row: SupabaseDatabase["public"]["Tables"]["product"]["Row"]): ProductRecord {
    const product: ProductRecord = {
      uuid: row.uuid,
      businessUuid: row.business_uuid,
      name: row.name,
      category: row.category,
      unitLabel: row.unit_label,
      price: Number(row.price),
      isAvailable: row.is_available,
      archivedAt: row.archived_at,
      updatedAt: row.updated_at,
    };
    if (row.description !== null) product.description = row.description;
    if (row.available_quantity !== null) product.availableQuantity = Number(row.available_quantity);
    return product;
  }

  public async getProduct(productUuid: string): Promise<ProductRecord | null> {
    const { data, error } = await this.client
      .from("product")
      .select("*")
      .eq("uuid", productUuid)
      .maybeSingle();
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load the product.");
    return data ? this.mapProduct(data) : null;
  }

  public async createProduct(
    businessUuid: string,
    input: {
      name: string;
      description?: string;
      category: string;
      unitLabel: string;
      price: number;
      availableQuantity?: number;
      isAvailable?: boolean;
    },
    actor: AuthenticatedActor,
  ): Promise<ProductRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("product")
      .insert({
        uuid: randomUUID(),
        business_uuid: businessUuid,
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        unit_label: input.unitLabel,
        price: input.price,
        available_quantity: input.availableQuantity ?? null,
        is_available: input.isAvailable ?? true,
        created_by: actor.uuid,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to create the product.");
    return this.mapProduct(data);
  }

  public async updateProduct(
    productUuid: string,
    input: {
      name: string;
      description?: string;
      category: string;
      unitLabel: string;
      price: number;
      availableQuantity?: number;
      isAvailable?: boolean;
    },
    _actor: AuthenticatedActor,
  ): Promise<ProductRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("product")
      .update({
        name: input.name,
        description: input.description ?? null,
        category: input.category,
        unit_label: input.unitLabel,
        price: input.price,
        available_quantity: input.availableQuantity ?? null,
        is_available: input.isAvailable ?? true,
        updated_at: now,
      })
      .eq("uuid", productUuid)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to update the product.");
    return this.mapProduct(data);
  }

  public async archiveProduct(
    productUuid: string,
    _actor: AuthenticatedActor,
  ): Promise<ProductRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("product")
      .update({ archived_at: now, updated_at: now })
      .eq("uuid", productUuid)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to archive the product.");
    return this.mapProduct(data);
  }

  public async createOrder(
    input: import("./types.js").OrderInput,
    customerUuid: string,
  ): Promise<OrderRecord> {
    const productRows = await Promise.all(
      input.lines.map((line) =>
        this.client
          .from("product")
          .select("uuid, business_uuid, name, unit_label, price, is_available, archived_at")
          .eq("uuid", line.productUuid)
          .maybeSingle(),
      ),
    );
    for (const result of productRows) {
      if (result.error || !result.data) throw new ApiError("VALIDATION_ERROR", "Every ordered product must exist.");
      if (result.data.business_uuid !== input.businessUuid) throw new ApiError("VALIDATION_ERROR", "All products must belong to one business.");
      if (result.data.archived_at !== null || !result.data.is_available) throw new ApiError("VALIDATION_ERROR", "Every ordered product must be available.");
    }
    const now = new Date().toISOString();
    const totalAmount = productRows.reduce((total, result, index) => {
      const quantity = input.lines[index]?.quantity ?? 0;
      return total + Number(result.data?.price ?? 0) * quantity;
    }, 0);
    const orderUuid = randomUUID();
    const { error: orderError } = await this.client
      .from("customer_order")
      .insert({
        uuid: orderUuid,
        customer_uuid: customerUuid,
        business_uuid: input.businessUuid,
        fulfillment_method: input.fulfillmentMethod,
        delivery_area: input.deliveryArea ?? null,
        private_delivery_details: input.privateDeliveryDetails ?? null,
        status: "submitted",
        total_amount: totalAmount,
        submitted_at: now,
        created_at: now,
        updated_at: now,
      });
    if (orderError) throw new ApiError("VALIDATION_ERROR", "Unable to create the order.");
    for (const result of productRows) {
      const line = input.lines[productRows.indexOf(result)];
      if (!line || !result.data) continue;
      const { error: lineError } = await this.client
        .from("order_line")
        .insert({
          uuid: randomUUID(),
          order_uuid: orderUuid,
          product_uuid: result.data.uuid,
          product_name_snapshot: result.data.name,
          unit_label_snapshot: result.data.unit_label,
          unit_price_snapshot: Number(result.data.price),
          quantity: line.quantity,
          created_at: now,
          updated_at: now,
        });
      if (lineError) throw new ApiError("VALIDATION_ERROR", "Unable to create an order line.");
    }
    return (await this.getOrder(orderUuid)) as OrderRecord;
  }

  public async getOrder(orderUuid: string): Promise<OrderRecord | null> {
    const { data: order, error } = await this.client
      .from("customer_order")
      .select("*")
      .eq("uuid", orderUuid)
      .is("archived_at", null)
      .maybeSingle();
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load the order.");
    if (!order) return null;
    const { data: lineData, error: lineError } = await this.client
      .from("order_line")
      .select("*")
      .eq("order_uuid", orderUuid)
      .is("archived_at", null);
    if (lineError) throw new ApiError("VALIDATION_ERROR", "Unable to load order lines.");
    return {
      uuid: order.uuid,
      customerUuid: order.customer_uuid,
      businessUuid: order.business_uuid,
      fulfillmentMethod: order.fulfillment_method,
      deliveryArea: order.delivery_area,
      privateDeliveryDetails: order.private_delivery_details,
      status: order.status,
      lines: (lineData ?? []).map((line) => ({
        uuid: line.uuid,
        productUuid: line.product_uuid,
        productNameSnapshot: line.product_name_snapshot,
        unitLabelSnapshot: line.unit_label_snapshot,
        unitPriceSnapshot: Number(line.unit_price_snapshot),
        quantity: Number(line.quantity),
        lineTotal: Number(line.unit_price_snapshot) * Number(line.quantity),
      })),
      totalAmount: Number(order.total_amount),
      updatedAt: order.updated_at,
      archivedAt: order.archived_at,
    };
  }

  public async listOrders(): Promise<OrderRecord[]> {
    const { data, error } = await this.client
      .from("customer_order")
      .select("uuid")
      .is("archived_at", null);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load orders.");
    const orders = await Promise.all((data ?? []).map((row) => this.getOrder(row.uuid)));
    return orders.filter((order): order is OrderRecord => order !== null);
  }

  public async updateOrderStatus(
    orderUuid: string,
    status: OrderStatus,
    _actor: AuthenticatedActor,
  ): Promise<OrderRecord> {
    const current = await this.getOrder(orderUuid);
    if (!current) throw new ApiError("VALIDATION_ERROR", "Order was not found.");
    if (!statusTransitions[current.status].includes(status)) {
      throw new ApiError("VALIDATION_ERROR", `Cannot change order from ${current.status} to ${status}.`);
    }
    const now = new Date().toISOString();
    const { error } = await this.client
      .from("customer_order")
      .update({ status, updated_at: now })
      .eq("uuid", orderUuid)
      .is("archived_at", null);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to update the order.");
    return (await this.getOrder(orderUuid)) as OrderRecord;
  }

  public async createReport(
    targetUuid: string,
    targetType: "business" | "product",
    reason: string,
    reporterUuid: string,
  ): Promise<ReportRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("content_report")
      .insert({
        uuid: randomUUID(),
        reporter_uuid: reporterUuid,
        target_uuid: targetUuid,
        target_type: targetType,
        reason,
        status: "open",
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to create the report.");
    return this.mapReport(data);
  }

  private mapReport(row: SupabaseDatabase["public"]["Tables"]["content_report"]["Row"]): ReportRecord {
    return {
      uuid: row.uuid,
      reporterUuid: row.reporter_uuid,
      targetUuid: row.target_uuid,
      targetType: row.target_type,
      reason: row.reason,
      status: row.status,
    };
  }

  public async updateReportStatus(
    reportUuid: string,
    status: ReportRecord["status"],
  ): Promise<ReportRecord> {
    const { data, error } = await this.client
      .from("content_report")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("uuid", reportUuid)
      .is("archived_at", null)
      .select("*")
      .maybeSingle();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to update the report.");
    return this.mapReport(data);
  }

  public async listReports(): Promise<ReportRecord[]> {
    const { data, error } = await this.client
      .from("content_report")
      .select("*")
      .is("archived_at", null);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load reports.");
    return (data ?? []).map((row) => this.mapReport(row));
  }

  public async listCategories(): Promise<CategoryRecord[]> {
    const { data, error } = await this.client
      .from("app_setting")
      .select("uuid, setting_name, archived_at")
      .like("setting_name", "category:%")
      .is("archived_at", null);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load categories.");
    return (data ?? []).map((row) => ({
      uuid: row.uuid,
      name: row.setting_name.slice("category:".length),
      archivedAt: row.archived_at,
    }));
  }

  public async createCategory(name: string): Promise<CategoryRecord> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("app_setting")
      .insert({
        uuid: randomUUID(),
        setting_name: `category:${name}`,
        setting_value: name,
        created_at: now,
        updated_at: now,
      })
      .select("uuid, setting_name, archived_at")
      .single();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to create the category.");
    return {
      uuid: data.uuid,
      name: data.setting_name.slice("category:".length),
      archivedAt: data.archived_at,
    };
  }

  public async productCategoryCounts(): Promise<AggregateRecord[]> {
    const { data, error } = await this.client
      .from("product")
      .select("category")
      .is("archived_at", null)
      .eq("is_available", true);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load product aggregates.");
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count }));
  }

  public async pushSyncRows(
    actor: AuthenticatedActor,
    rows: SyncRow[],
  ): Promise<SyncPushResult> {
    const accepted: string[] = [];
    const rejected: Array<{ uuid: string; reason: string }> = [];
    for (const row of rows) {
      if (row.fields.createdBy !== undefined && row.fields.createdBy !== actor.uuid) {
        rejected.push({ uuid: row.uuid, reason: "createdBy is server-owned." });
        continue;
      }
      accepted.push(row.uuid);
    }
    return { accepted, rejected };
  }

  public async pullSyncRows(
    actor: AuthenticatedActor,
    since: string | null,
  ): Promise<SyncRow[]> {
    const tables = ["business", "product", "customer_order", "order_line", "content_report"] as const;
    const rows: SyncRow[] = [];
    for (const table of tables) {
      let query = this.client.from(table).select("*");
      if (since) query = query.gt("updated_at", since);
      const { data } = await query;
      for (const row of data ?? []) {
        const record = row as { uuid: string; updated_at: string | null; archived_at: string | null };
        if (table === "customer_order" && actor.role === "customer" && "customer_uuid" in row && row.customer_uuid !== actor.uuid) continue;
        rows.push({
          table,
          uuid: record.uuid,
          updatedAt: record.updated_at,
          archivedAt: record.archived_at,
          fields: { ...row },
        });
      }
    }
    return rows;
  }

  public async listConfiguration(): Promise<AppConfiguration[]> {
    const { data, error } = await this.client
      .from("app_setting")
      .select("setting_name, setting_value, updated_at")
      .is("archived_at", null);
    if (error) throw new ApiError("VALIDATION_ERROR", "Unable to load configuration.");
    return (data ?? []).map((row) => ({
      name: row.setting_name,
      value: row.setting_value,
      updatedAt: row.updated_at,
    }));
  }

  public async setConfiguration(name: string, value: string): Promise<AppConfiguration> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("app_setting")
      .upsert({
        uuid: randomUUID(),
        setting_name: name,
        setting_value: value,
        updated_at: now,
      }, { onConflict: "setting_name" })
      .select("setting_name, setting_value, updated_at")
      .maybeSingle();
    if (error || !data) throw new ApiError("VALIDATION_ERROR", "Unable to save configuration.");
    return { name: data.setting_name, value: data.setting_value, updatedAt: data.updated_at };
  }

  public async runRetention(cutoffIso: string): Promise<{ archivedAccounts: number; archivedOrders: number }> {
    const cutoff = new Date(cutoffIso).toISOString();
    const { data: orders } = await this.client
      .from("customer_order")
      .update({ archived_at: cutoff, updated_at: new Date().toISOString() })
      .lt("updated_at", cutoff)
      .is("archived_at", null)
      .select("uuid");
    return { archivedAccounts: 0, archivedOrders: (orders ?? []).length };
  }

  public async backupSnapshot(): Promise<Record<string, unknown>> {
    const [businesses, products, orders, reports, settings] = await Promise.all([
      this.client.from("business").select("*").is("archived_at", null),
      this.client.from("product").select("*").is("archived_at", null),
      this.client.from("customer_order").select("*").is("archived_at", null),
      this.client.from("content_report").select("*").is("archived_at", null),
      this.client.from("app_setting").select("*").is("archived_at", null),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      businesses: businesses.data ?? [],
      products: products.data ?? [],
      orders: orders.data ?? [],
      reports: reports.data ?? [],
      settings: settings.data ?? [],
    };
  }
}
