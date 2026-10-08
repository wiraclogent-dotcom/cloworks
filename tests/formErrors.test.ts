import { describe, it, expect } from "vitest";
import { errorSummary } from "@/lib/formErrors";

const labels: Record<string, string> = { title: "Title", deadline: "Deadline", briefUrl: "Brief link" };
const labelOf = (k: string) => labels[k] ?? "";

describe("errorSummary", () => {
  it("counts and joins problems, adding the label only when the message lacks it", () => {
    expect(errorSummary({ title: "Title is required", deadline: "Cannot be in the past" }, labelOf))
      .toBe("2 problems: Title is required; Deadline: Cannot be in the past");
  });
  it("uses the singular and handles no errors", () => {
    expect(errorSummary({ briefUrl: "Must be an http(s) link" }, labelOf)).toBe("1 problem: Brief link: Must be an http(s) link");
    expect(errorSummary({}, labelOf)).toBe("");
  });
});
