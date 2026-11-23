export const roles = [
  "system_admin",
  "platform_admin",
  "business",
  "customer",
] as const;

export type Role = (typeof roles)[number];

export interface AuthenticatedActor {
  uuid: string;
  role: Role;
  email?: string;
}

export interface ProductInput {
  name: string;
  description?: string;
  category: string;
  unitLabel: string;
  price: number;
  availableQuantity?: number;
  isAvailable?: boolean;
}

export interface OrderLineInput {
  productUuid: string;
  quantity: number;
}

export interface OrderInput {
  businessUuid: string;
  fulfillmentMethod: "pickup" | "delivery";
  deliveryArea?: string;
  privateDeliveryDetails?: string;
  lines: OrderLineInput[];
}
