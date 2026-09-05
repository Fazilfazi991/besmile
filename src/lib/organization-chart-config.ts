export type OrganizationChartNode = {
  key: string;
  displayName: string;
  designation: string;
  parentKey: string | null;
  profileNameAliases?: readonly string[];
  avatar?: string;
};

export const organizationChart = [
  { key: "director", displayName: "Director", designation: "Director", parentKey: null, profileNameAliases: ["Director"], avatar: "/employee_demo_dps_webp/director.webp" },
  { key: "general-manager", displayName: "Fayiz", designation: "General Manager", parentKey: "director", profileNameAliases: ["Fayiz", "Muhammad Faiz AU"] },
  { key: "assistant-manager", displayName: "Diya Anthikat", designation: "Assistant Manager", parentKey: "general-manager", profileNameAliases: ["Diya Anthikat"], avatar: "/employee_demo_dps_webp/diya_anthikat.webp" },
  { key: "sales-coordinator", displayName: "Fathima", designation: "Sales Coordinator", parentKey: "general-manager", profileNameAliases: ["Fathima"] },
  { key: "psychologist", displayName: "Aiswarya P", designation: "Psychologist", parentKey: "assistant-manager", profileNameAliases: ["Aiswarya P"], avatar: "/employee_demo_dps_webp/aiswarya_p.webp" },
  { key: "admin", displayName: "Anushma VK", designation: "Admin", parentKey: "assistant-manager", profileNameAliases: ["Anushma VK"], avatar: "/employee_demo_dps_webp/anushma_vk.webp" },
  { key: "intern", displayName: "Intern", designation: "Internship", parentKey: "assistant-manager", profileNameAliases: ["Intern"] },
] as const satisfies readonly OrganizationChartNode[];

export function normalizedOrganizationName(value?: string | null) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase() || "";
}

export function organizationNodeForProfile(profileName?: string | null) {
  const normalizedProfileName = normalizedOrganizationName(profileName);
  if (!normalizedProfileName) return null;
  return organizationChart.find((node) =>
    (node.profileNameAliases || [node.displayName]).some(
      (name) => normalizedOrganizationName(name) === normalizedProfileName,
    ),
  ) || null;
}
