export type MarketingErrorCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID";

/** A Marketing Calendar rule or validation failure; actions turn it into `{ ok: false, code, message, fieldErrors }`. */
export class MarketingError extends Error {
  constructor(public code: MarketingErrorCode, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "MarketingError";
  }
}
