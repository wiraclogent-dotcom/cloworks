export type NoteErrorCode = "NOT_FOUND" | "VALIDATION" | "INVALID" | "TOO_LARGE" | "DELETED";

/** A refused Notes read or write; server actions turn it into a result object (Next redacts thrown errors). */
export class NoteError extends Error {
  constructor(public code: NoteErrorCode, message: string) {
    super(message);
    this.name = "NoteError";
  }
}
