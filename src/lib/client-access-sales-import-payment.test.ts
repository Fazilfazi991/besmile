import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  employeeNavigation,
  employeeRouteRequirement,
  filterNavigation,
  permissionAllows,
} from "./permission-access";
import { resolveCrmLeadSource } from "./crm-lead-source";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260921095756_client_access_sales_import_payment_alignment.sql",
  ),
  "utf8",
);
const qualificationMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260921144702_qa_qualification_permission_alignment.sql",
  ),
  "utf8",
);
const conversionTriggerMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260921152904_qa_lead_conversion_trigger_alignment.sql",
  ),
  "utf8",
);
const adminLead = readFileSync(
  resolve(process.cwd(), "src/app/admin/crm/leads/[id]/page.tsx"),
  "utf8",
);
const employeeLead = readFileSync(
  resolve(process.cwd(), "src/app/employee/crm/leads/[id]/page.tsx"),
  "utf8",
);
const employeeRepository = readFileSync(
  resolve(process.cwd(), "src/lib/employee-repository.ts"),
  "utf8",
);
const importer = readFileSync(
  resolve(process.cwd(), "src/components/crm-lead-import.tsx"),
  "utf8",
);
const adminImportPage = readFileSync(
  resolve(process.cwd(), "src/app/admin/crm/import/page.tsx"),
  "utf8",
);
const employeeImportPage = readFileSync(
  resolve(process.cwd(), "src/app/employee/crm/import/page.tsx"),
  "utf8",
);
const payments = readFileSync(
  resolve(process.cwd(), "src/components/psychologist-session-payables.tsx"),
  "utf8",
);

describe("client access, CRM import, and psychologist payment alignment", () => {
  it("adds only the canonical scoped CRM permissions required by QA qualification", () => {
    for (const permission of ["crm.view_assigned", "leads.edit"])
      expect(qualificationMigration).toContain(`'${permission}'`);

    expect(qualificationMigration).toContain("('Psychology', 'Psychologist', 'crm.view_assigned')");
    expect(qualificationMigration).toContain("('Operations', 'Sales Coordinator', 'crm.view_assigned')");
    expect(qualificationMigration).toContain("('Operations', 'Sales Coordinator', 'leads.edit')");
    expect(qualificationMigration).toContain("role.code = 'psychologist'");
    expect(qualificationMigration).toContain("on conflict do nothing");
    expect(qualificationMigration).not.toMatch(/crm\.manage_all|admin\.shell|finance\.|patients\./);
    expect(qualificationMigration).not.toMatch(/create\s+policy|drop\s+policy|disable\s+row level security|grant\s+all/i);
    expect(qualificationMigration).not.toMatch(/delete\s+from|update\s+public\.(?:role_permissions|designation_permission_bundle_permissions)/i);
  });

  it("adds approved designation permissions without replacing prior grants", () => {
    for (const permission of [
      "leads.convert_to_patient",
      "patients.view_all",
      "patients.create",
      "patients.edit",
      "patients.assign",
      "patient_documents.archive",
      "patient_documents.replace",
      "patient_sessions.create",
      "patient_activity.view",
      "appointments.update_status",
      "crm.import",
      "leads.create",
    ])
      expect(migration).toContain(`'${permission}'`);

    expect(migration).toContain("designation = 'Assistant Manager'");
    expect(migration).toContain("designation = 'Psychologist'");
    expect(migration).toContain("designation = 'Sales Coordinator'");
    expect(migration).toContain("on conflict do nothing");
    expect(migration).not.toMatch(
      /delete\s+from\s+public\.(role_permissions|designation_permission_bundle_permissions)/i,
    );
    expect(migration).not.toMatch(/disable\s+row level security|grant\s+all/i);
    expect(migration).not.toMatch(/create\s+policy/i);

    const salesCoordinatorStart = migration.indexOf(
      "bundle.designation = 'Sales Coordinator'",
    );
    const salesCoordinatorTail = migration.slice(salesCoordinatorStart);
    const salesCoordinatorEnd = salesCoordinatorTail.search(
      /\)\r?\n\)\r?\ninsert into/,
    );
    expect(salesCoordinatorStart).toBeGreaterThanOrEqual(0);
    expect(salesCoordinatorEnd).toBeGreaterThanOrEqual(0);
    const salesCoordinatorGrant = salesCoordinatorTail.slice(
      0,
      salesCoordinatorEnd,
    );
    expect(salesCoordinatorGrant).toContain("array['crm.import','leads.create']");
    expect(salesCoordinatorGrant).not.toMatch(
      /admin\.shell|crm\.manage_all|leads\.assign/,
    );
  });

  it("hardens the atomic lead conversion RPC with management and scoped paths", () => {
    expect(migration).toContain(
      "create or replace function public.convert_lead_to_patient",
    );
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("public.has_permission('crm.manage_all')");
    expect(migration).toContain(
      "public.has_permission('leads.convert_to_patient')",
    );
    expect(migration).toContain("public.has_permission('patients.create')");
    expect(migration).toContain(
      "public.crm_lead_can_view(lead_row.assigned_to, lead_row.converted_patient_id)",
    );
    expect(migration).toContain("for update");
    expect(migration).toContain("lead_converted_to_patient");
    expect(migration).toContain(
      "revoke all on function public.convert_lead_to_patient(uuid, text)",
    );
    expect(migration).toContain("to authenticated");

    expect(conversionTriggerMigration).toContain(
      "current_setting('app.lead_conversion_target', true)",
    );
    expect(conversionTriggerMigration).toContain(
      "set_config('app.lead_conversion_target', lead_row.id::text, true)",
    );
    expect(conversionTriggerMigration).toContain(
      "public.crm_lead_can_view(old.assigned_to, old.converted_patient_id)",
    );
    expect(conversionTriggerMigration).toContain(
      "public.has_permission('leads.convert_to_patient')",
    );
    expect(conversionTriggerMigration).not.toMatch(
      /insert\s+into\s+public\.(?:role_permissions|designation_permission_bundle_permissions)|create\s+policy|drop\s+policy|disable\s+row level security|grant\s+all/i,
    );
  });

  it("uses one conversion architecture and permission-gates both lead screens", () => {
    expect(adminLead).toContain('"leads.convert_to_patient"');
    expect(adminLead).toContain('"crm.manage_all"');
    expect(adminLead).toContain('permissions.has("patients.create")');
    expect(adminLead).toContain("<LeadToPatientConversion");
    expect(employeeLead).toContain("'leads.convert_to_patient'");
    expect(employeeLead).toContain("'patients.create'");
    expect(employeeLead).toContain("<LeadToPatientConversion");
    expect(employeeRepository).toContain(
      'rpc("convert_lead_to_patient"',
    );
    expect(employeeRepository).toContain(
      "converted_patient:patients!crm_leads_converted_patient_id_fkey",
    );
  });

  it("exposes the shared importer only through the narrow employee permission", () => {
    const importOnly = new Set(["crm.import"]);
    expect(
      permissionAllows(
        importOnly,
        employeeRouteRequirement("/employee/crm/import"),
      ),
    ).toBe(true);
    expect(
      permissionAllows(
        new Set(["leads.view"]),
        employeeRouteRequirement("/employee/crm/import"),
      ),
    ).toBe(false);

    const crmLinks = filterNavigation(employeeNavigation, importOnly)
      .find((group) => group.title === "CRM")
      ?.links.map((link) => link.href);
    expect(crmLinks).toContain("/employee/crm/import");
    expect(crmLinks).not.toContain("/admin/crm");
    expect(adminImportPage).toContain("<CrmLeadImport />");
    expect(employeeImportPage).toContain("<CrmLeadImport />");
    expect(importer).toContain('accept=".csv,.xlsx,.xls"');
    expect(importer).toContain("value=\"update\"");
    expect(importer).toContain("resolveCrmLeadSource");

    const sources = [
      { id: "outdoor", name: "Outdoor Marketing" },
      { id: "other", name: "Other" },
    ];
    expect(resolveCrmLeadSource(sources, " outdoor marketing ")).toEqual(
      sources[0],
    );
  });

  it("settles scheduled and payment-due rows while protecting paid rows", () => {
    expect(payments).toContain(
      "x.status === 'payment_due' || x.status === 'scheduled'",
    );
    expect(payments).toContain(
      "const canMarkPaid = canSettlePermission &&",
    );
    expect(payments).toContain(
      "No psychologist payments match these filters.",
    );
    expect(payments).not.toMatch(
      /canSettlePermission\s*&&\s*x\.status\s*===\s*['"]paid['"]/,
    );
    expect(payments).toContain(
      "db.rpc('settle_psychologist_session_payable'",
    );
  });
});
