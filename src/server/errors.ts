import { log } from "./log";

export const ERROR_STATUS = {
  unauthenticated: 401,
  not_onboarded: 409,
  invalid: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  insufficient_seeds: 402,
  rate_limited: 429,
  gone: 410,
  unavailable: 503,
  internal: 500,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;

export class AppError extends Error {
  readonly status: number;

  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
    this.status = ERROR_STATUS[code];
  }
}

export function toErrorResponse(
  err: unknown,
  requestId: string,
): { status: number; body: { error: { code: ErrorCode; message: string } } } {
  if (isAppError(err)) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message } },
    };
  }
  log.error("http.internal", { requestId });
  return {
    status: ERROR_STATUS.internal,
    body: {
      error: {
        code: "internal",
        message: `Something went wrong (ref ${requestId})`,
      },
    },
  };
}

function isAppError(err: unknown): err is AppError {
  try {
    return err instanceof AppError;
  } catch {
    return false;
  }
}
