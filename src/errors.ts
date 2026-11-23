export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR";

export class ApiError extends Error {
  public constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function validationError(
  message: string,
  details?: Record<string, string>,
): ApiError {
  return new ApiError("VALIDATION_ERROR", message, details);
}
