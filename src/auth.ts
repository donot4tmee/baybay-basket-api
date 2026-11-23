import { ApiError } from "./errors.js";
import type { AuthenticatedActor } from "./types.js";

export interface AccessTokenVerifier {
  verifyAccessToken(token: string): Promise<AuthenticatedActor | null>;
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | null {
  if (!authorizationHeader) {
    return null;
  }

  const match = /^Bearer ([^\s]+)$/.exec(authorizationHeader);
  return match?.[1] ?? null;
}

export async function authenticateRequest(
  authorizationHeader: string | undefined,
  verifier: AccessTokenVerifier,
): Promise<AuthenticatedActor> {
  const token = extractBearerToken(authorizationHeader);
  if (!token) {
    throw new ApiError("UNAUTHORIZED", "A bearer access token is required.");
  }

  const actor = await verifier.verifyAccessToken(token);
  if (!actor) {
    throw new ApiError("UNAUTHORIZED", "The access token is invalid.");
  }

  return actor;
}
