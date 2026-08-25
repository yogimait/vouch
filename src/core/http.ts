// The single enforcement point for the response envelope. Never build a Response by hand.
import { ERROR_CODES, httpStatusFor, messageFor, type ErrorCode } from "@/core/errors";
import type { PayResult } from "@/core/orders/pay";

export interface ApiSuccess<T> {
  status: true;
  statusCode: number;
  data: T;
  message?: string;
}

export interface ApiError {
  status: false;
  statusCode: number;
  message: string;
  error: { code: ErrorCode; details?: Record<string, unknown> };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, statusCode = 200, message?: string): Response {
  return Response.json({ status: true, statusCode, data, message } satisfies ApiSuccess<T>, { status: statusCode });
}

/** ESCALATE is accepted, not refused — a human can still complete it. */
export function accepted<T>(data: T, message?: string): Response {
  return ok(data, 202, message);
}

export function created<T>(data: T, message?: string): Response {
  return ok(data, 201, message);
}

export function fail(code: ErrorCode, details?: Record<string, unknown>, message?: string): Response {
  const statusCode = httpStatusFor(code);
  const body: ApiError = {
    status: false,
    statusCode,
    message: message ?? messageFor(code),
    error: { code, details },
  };
  return Response.json(body, { status: statusCode });
}

export function isKnownErrorCode(value: string): value is ErrorCode {
  return value in ERROR_CODES;
}

/**
 * The three outcomes map to HTTP in exactly one place. ESCALATE is 202, not an error: it was
 * accepted and a human can still complete it. Putting this in a route would let a handler pair a
 * wrong status with a right code.
 */
export function payResponse(result: PayResult): Response {
  if (result.outcome === "ADMIT") {
    return created({
      order_id: result.orderId,
      amount_paise: result.amountPaise.toString(),
      authorization_url: result.authorizationUrl,
      decision_id: result.decisionId,
      replayed: result.replayed,
    });
  }

  if (result.outcome === "ESCALATE") {
    return accepted({
      order_id: result.orderId,
      amount_paise: result.amountPaise.toString(),
      payment_link: result.paymentLink,
      decision_id: result.decisionId,
      reasons: result.reasons,
      replayed: result.replayed,
    }, "Beyond this agent's delegated authority. A human can complete it at payment_link.");
  }

  const reason = result.reasons[0];
  return fail(result.code, {
    observed: reason?.observed,
    expected: reason?.expected,
    rule: reason?.rule,
    decision_id: result.decisionId,
  });
}
