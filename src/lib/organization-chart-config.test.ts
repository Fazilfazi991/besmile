import { describe, expect, it } from "vitest";
import { organizationChart, organizationNodeForProfile } from "./organization-chart-config";

describe("organization chart configuration", () => {
  it("keeps the approved hierarchy in one display-only configuration", () => {
    expect(organizationChart.map(({ displayName, designation, parentKey }) => ({ displayName, designation, parentKey }))).toEqual([
      { displayName: "Yousaf KS", designation: "Director", parentKey: null },
      { displayName: "Fayiz", designation: "General Manager", parentKey: "director" },
      { displayName: "Diya Anthikat", designation: "Assistant Manager", parentKey: "general-manager" },
      { displayName: "Fathima", designation: "Sales Coordinator", parentKey: "general-manager" },
      { displayName: "Aiswarya P", designation: "Psychologist", parentKey: "assistant-manager" },
      { displayName: "Anushma VK", designation: "Admin", parentKey: "assistant-manager" },
      { displayName: "Intern", designation: "Internship", parentKey: "assistant-manager" },
    ]);
  });

  it("matches only approved normalized display names and never guesses", () => {
    expect(organizationNodeForProfile("  Muhammad   Faiz AU ")?.key).toBe("general-manager");
    expect(organizationNodeForProfile("Diya Anthikat")?.key).toBe("assistant-manager");
    expect(organizationNodeForProfile("Unknown Employee")).toBeNull();
  });

  it("contains no contact or private HR fields", () => {
    const serialized = JSON.stringify(organizationChart).toLowerCase();
    for (const privateField of ["email", "phone", "salary", "attendance", "payment"]) expect(serialized).not.toContain(privateField);
  });
});
