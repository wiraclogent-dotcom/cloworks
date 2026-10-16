import { describe, it, expect } from "vitest";
import { isFileLocation, isServerPath } from "@/lib/fileLocation";
import { cleanFileUrl } from "@/lib/projectTasks";

describe("isFileLocation", () => {
  it("accepts web links and file-server paths", () => {
    for (const v of ["https://drive.google.com/x", "http://a.com", String.raw`\\192.168.1.10\Design\Brief 2026`, "//192.168.1.10/Design", String.raw`\\nas`, "smb://nas.local/design", "afp://mac.local/x", String.raw`Z:\Projects\Q4`])
      expect(isFileLocation(v), v).toBe(true);
  });
  it("rejects everything else", () => {
    for (const v of ["", "   ", "javascript:alert(1)", "data:text/html,x", "ftp://x.com/a", "notaurl", String.raw`\\`, "//", "a\nb", "https://" + "a".repeat(2050)])
      expect(isFileLocation(v), v).toBe(false);
  });
  it("tells server paths from web links", () => {
    expect(isServerPath(String.raw`\\192.168.1.10\Design`)).toBe(true);
    expect(isServerPath("https://a.com")).toBe(false);
  });
});

describe("cleanFileUrl", () => {
  it("keeps server paths", () => {
    expect(cleanFileUrl(String.raw`  \\192.168.1.10\Design  `)).toBe(String.raw`\\192.168.1.10\Design`);
    expect(cleanFileUrl("nope")).toBeUndefined();
    expect(cleanFileUrl("")).toBeNull();
  });
});
