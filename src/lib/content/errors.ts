export type ContentErrorCode = "FORBIDDEN" | "NOT_FOUND" | "INVALID" | "LOCKED" | "CONFLICT";
export class ContentError extends Error {
  constructor(public code: ContentErrorCode, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ContentError";
  }
}
