import { ApiError } from "./errors.js";
import type { AuthenticatedActor, Role } from "./types.js";

export function requireRole(
  actor: AuthenticatedActor,
  ...allowedRoles: Role[]
): void {
  if (!allowedRoles.includes(actor.role)) {
    throw new ApiError("FORBIDDEN", "The actor is not allowed to perform this action.");
  }
}

export function requireBusinessOwnership(
  actor: AuthenticatedActor,
  ownerUuid: string,
): void {
  if (actor.role === "system_admin" || actor.role === "platform_admin") {
    return;
  }

  if (actor.role !== "business" || actor.uuid !== ownerUuid) {
    throw new ApiError("FORBIDDEN", "The actor does not own this business.");
  }
}
