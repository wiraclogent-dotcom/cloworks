/** Shown when a server action throws (network drop, a deploy that changed action ids, a server crash). */
export const ACTION_FAILED_MESSAGE = "Could not save. Check your connection and try again.";

export type ActionFailed = { ok: false; code: "ERROR"; message: string };

/**
 * Runs a server action from a client component and turns a throw into an `{ ok: false }` result. Inside a transition an
 * uncaught throw goes to the error boundary and replaces the whole page, so controls call actions through this instead.
 */
export async function safeAction<T>(run: () => Promise<T>): Promise<T | ActionFailed> {
  try {
    return await run();
  } catch {
    return { ok: false, code: "ERROR", message: ACTION_FAILED_MESSAGE };
  }
}
