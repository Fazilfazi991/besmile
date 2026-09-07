import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const component = readFileSync("src/components/mobile-back-link.tsx", "utf8");
describe("mobile back navigation", () => {
  it("uses browser history for same-origin navigation and a parent fallback for direct entry", () => {
    expect(component).toContain("router.back()");
    expect(component).toContain("router.push(fallback)");
    expect(component).toContain("new URL(document.referrer).origin === window.location.origin");
  });
  it("is mobile-only with a comfortable target", () => {
    expect(component).toContain("min-h-11");
    expect(component).toContain("md:hidden");
  });
});
