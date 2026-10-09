import { describe, it, expect } from "vitest";
import { stripInterceptionMarkers } from "@/lib/interceptedParam";

// Next 16.4 dev bug: after a route file under /requests is recompiled, the intercepted panel's `id` param arrives
// as "(.)<id>", one more "(.)" per recompile, so the lookup 404s ("Page not found" on card click).
describe("stripInterceptionMarkers", () => {
  it("removes any number of leading (.) markers", () => {
    expect(stripInterceptionMarkers("(.)cmuz7z66i01mlnd43xlmuazw7")).toBe("cmuz7z66i01mlnd43xlmuazw7");
    expect(stripInterceptionMarkers("(.)(.)(.)(.)(.)cmuz7z66i01mlnd43xlmuazw7")).toBe("cmuz7z66i01mlnd43xlmuazw7");
  });
  it("also removes the other interception markers", () => {
    expect(stripInterceptionMarkers("(..)(...)(..)(..)abc")).toBe("abc");
  });
  it("leaves a normal id alone, including brackets later in the value", () => {
    expect(stripInterceptionMarkers("cmuz7z66i01mlnd43xlmuazw7")).toBe("cmuz7z66i01mlnd43xlmuazw7");
    expect(stripInterceptionMarkers("abc(.)def")).toBe("abc(.)def");
  });
});
