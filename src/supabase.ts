import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccessTokenVerifier } from "./auth.js";
import type { AuthenticatedActor, Role } from "./types.js";

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
    };
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
