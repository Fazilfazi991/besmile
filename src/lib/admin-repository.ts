import { supabase } from "./supabase";
import type { Employee } from "./employees";
import { employeeSalarySettingsSelect } from "./payroll-query";
import { financeAccountBalance } from "./finance-rules";
import { documentFileValidationMessage } from "./document-file-rules";
import { dateKey } from "./attendance-rules";
import { operationalEmployeeStatuses } from "./employee-status";
const db = supabase as any;
export type Department = { id: string; name: string };
export type Designation = {
  id: string;
  name: string;
  department_id: string | null;
};
export type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  created_at: string;
  actor_id: string | null;
};
function requireDb() {
  if (!db) throw new Error("Supabase is not configured.");
  return db;
}
const employeeRemovalSchemaUnavailable = (error: any) =>
  /removed_at|removal_reason|removed_by|profiles_removed_by_fkey|schema cache|relationship/i.test(
    String(error?.message || ""),
  );
export const adminRepository = {
  async crmDashboardSummary(start: string, end: string) {
    const { data, error } = await requireDb().rpc("crm_dashboard_summary", {
      period_start: start,
      period_end: end,
    });
    if (error) throw error;
    return data;
  },
  async financeDashboard() {
    const r = requireDb();
    const [accounts, transactions, invoices, payroll, runs] = await Promise.all(
      [
        r.from("finance_accounts").select("*").eq("is_active", true),
        r
          .from("finance_transactions")
          .select("*,account:finance_accounts(name)")
          .is("archived_at", null)
          .order("transaction_date", { ascending: false }),
        r
          .from("finance_invoices")
          .select(
            "id,status,tax,discount,finance_invoice_items(quantity,rate),finance_invoice_payments(amount)",
          )
          .is("archived_at", null),
        r
          .from("payroll_entries")
          .select("payment_status,basic_salary,allowances,deductions"),
        r
          .from("payroll_runs")
          .select("id,period_start,period_end,status")
          .order("period_start", { ascending: false })
          .limit(6),
      ],
    );
    for (const item of [accounts, transactions, invoices, payroll, runs])
      if (item.error) throw item.error;
    const rows = transactions.data || [];
    const income = rows
      .filter((x: any) =>
        ["income", "invoice_payment"].includes(x.transaction_type),
      )
      .reduce((n: number, x: any) => n + Number(x.amount), 0);
    const expenses = rows
      .filter((x: any) =>
        ["expense", "payroll_payment", "psychologist_payment"].includes(
          x.transaction_type,
        ),
      )
      .reduce((n: number, x: any) => n + Number(x.amount), 0);
    const accountBalances = (accounts.data || []).map((account: any) => ({
      ...account,
      balance: financeAccountBalance(
        account.opening_balance,
        rows.filter((x: any) => x.account_id === account.id),
      ),
    }));
    const pending = (payroll.data || []).filter(
      (x: any) => x.payment_status !== "paid",
    );
    const openInvoices = (invoices.data || []).filter(
      (x: any) => !["paid", "cancelled"].includes(x.status),
    );
    const outstandingAmount = openInvoices.reduce(
      (sum: number, invoice: any) =>
        sum +
        ((invoice.finance_invoice_items || []).reduce(
          (itemSum: number, item: any) =>
            itemSum + Number(item.quantity) * Number(item.rate),
          0,
        ) +
          Number(invoice.tax || 0) -
          Number(invoice.discount || 0) -
          (invoice.finance_invoice_payments || []).reduce(
            (paid: number, payment: any) => paid + Number(payment.amount),
            0,
          )),
      0,
    );
    return {
      income,
      expenses,
      net: income - expenses,
      balance: accountBalances.reduce((n: number, x: any) => n + x.balance, 0),
      accountBalances,
      outstanding: openInvoices.length,
      outstandingAmount,
      salariesPending: pending.reduce(
        (n: number, x: any) =>
          n +
          Number(x.basic_salary) +
          Number(x.allowances) -
          Number(x.deductions),
        0,
      ),
      recent: rows.slice(0, 8),
      recentRuns: runs.data || [],
      monthly: rows,
    };
  },
  async financeOptions() {
    const r = requireDb();
    const [accounts, income, expense] = await Promise.all([
      r.from("finance_accounts").select("id,name").eq("is_active", true),
      r
        .from("finance_income_categories")
        .select("id,name")
        .eq("is_active", true),
      r
        .from("finance_expense_categories")
        .select("id,name")
        .eq("is_active", true),
    ]);
    for (const item of [accounts, income, expense])
      if (item.error) throw item.error;
    return {
      accounts: accounts.data || [],
      income: income.data || [],
      expense: expense.data || [],
    };
  },
  async financeTransactions(type: string, includeArchived = false) {
    let q = requireDb()
      .from("finance_transactions")
      .select(
        "*,account:finance_accounts(name),income_category:finance_income_categories(name),expense_category:finance_expense_categories(name)",
      )
      .eq("transaction_type", type)
      .order("transaction_date", { ascending: false });
    if (!includeArchived) q = q.is("archived_at", null);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async createFinanceTransaction(payload: any) {
    const { data, error } = await requireDb()
      .from("finance_transactions")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateFinanceTransaction(id: string, patch: any) {
    const { data, error } = await requireDb()
      .from("finance_transactions")
      .update(patch)
      .eq("id", id)
      .is("archived_at", null)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async archiveFinanceTransaction(id: string) {
    const { error } = await requireDb()
      .from("finance_transactions")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .is("archived_at", null);
    if (error) throw error;
  },
  async restoreFinanceTransaction(id: string) {
    const { error } = await requireDb()
      .from("finance_transactions")
      .update({ archived_at: null })
      .eq("id", id)
      .not("archived_at", "is", null);
    if (error) throw error;
  },
  async uploadFinanceReceipt(userId: string, file: File) {
    const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await requireDb()
      .storage.from("finance-receipts")
      .upload(path, file);
    if (error) throw error;
    return path;
  },
  async signedFinanceReceipt(path: string) {
    const { data, error } = await requireDb()
      .storage.from("finance-receipts")
      .createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
  },
  async financeInvoices() {
    const r = requireDb();
    const { data, error } = await r
      .from("finance_invoices")
      .select("*,finance_invoice_items(*),finance_invoice_payments(*)")
      .is("archived_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async financeInvoice(id: string) {
    const { data, error } = await requireDb()
      .from("finance_invoices")
      .select(
        "*,finance_invoice_items(*),finance_invoice_payments(*,finance_accounts(name))",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
  async createFinanceInvoice(payload: any, items: any[]) {
    const { data, error } = await requireDb().rpc(
      "create_finance_invoice_atomic",
      {
        target_invoice_number: payload.invoice_number,
        target_client: payload.client_id || null,
        target_customer_name: payload.customer_name,
        target_customer_phone: payload.customer_phone || null,
        target_customer_email: payload.customer_email || null,
        target_issue_date: payload.issue_date,
        target_due_date: payload.due_date || null,
        target_discount: payload.discount || 0,
        target_tax: payload.tax || 0,
        target_notes: payload.notes || null,
        target_status: payload.status,
        target_currency: payload.currency || "INR",
        item_rows: items,
      },
    );
    if (error) throw error;
    return data;
  },
  async updateFinanceInvoice(id: string, patch: any) {
    const { data, error } = await requireDb()
      .from("finance_invoices")
      .update(patch)
      .eq("id", id)
      .eq("status", "draft")
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async recordInvoicePayment(payload: any) {
    const { data, error } = await requireDb().rpc(
      "record_invoice_payment_atomic",
      {
        target_invoice: payload.invoice_id,
        target_account: payload.account_id,
        payment_amount: payload.amount,
        paid_on: payload.payment_date,
        method: payload.payment_method,
        reference: payload.reference_number || null,
      },
    );
    if (error) throw error;
    return data;
  },
  async payrollRuns() {
    const { data, error } = await requireDb()
      .from("payroll_runs")
      .select("*,payroll_entries(*)")
      .order("period_start", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async salarySettings() {
    const { data, error } = await requireDb()
      .from("employee_salary_settings")
      .select(employeeSalarySettingsSelect)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async saveSalarySetting(payload: any) {
    const { data, error } = await requireDb()
      .from("employee_salary_settings")
      .upsert(payload, { onConflict: "profile_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async createPayrollRun(payload: any, _entries: any[]) {
    const { data, error } = await requireDb().rpc("create_payroll_run_atomic", {
      target_period_start: payload.period_start,
      target_period_end: payload.period_end,
    });
    if (error) throw error;
    return data;
  },
  async payrollRun(id: string) {
    const { data, error } = await requireDb()
      .from("payroll_runs")
      .select(
        "*,payroll_entries(*,profile:profiles(full_name,email,employee_code,designation,department:departments(name)))",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
  async updatePayrollRun(id: string, patch: any) {
    const { data, error } = await requireDb()
      .from("payroll_runs")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updatePayrollEntry(id: string, patch: any) {
    const { data, error } = await requireDb()
      .from("payroll_entries")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async removePayrollEntry(id: string) {
    const { error } = await requireDb()
      .from("payroll_entries")
      .delete()
      .eq("id", id)
      .eq("payment_status", "draft");
    if (error) throw error;
  },
  async payPayrollEntry(entry: any, payment: any, _actorId: string) {
    if (entry.finance_transaction_id || entry.payment_status === "paid")
      throw new Error("This salary has already been paid.");
    const { data, error } = await requireDb().rpc("pay_payroll_entry_atomic", {
      target_entry: entry.id,
      target_account: payment.account_id,
      paid_on: payment.payment_date,
      method: payment.payment_method,
      reference: payment.payment_reference || null,
    });
    if (error) throw error;
    return data;
  },
  async financeReport() {
    const r = requireDb();
    const [transactions, invoices, payroll] = await Promise.all([
      r
        .from("finance_transactions")
        .select(
          "*,account:finance_accounts(name),income_category:finance_income_categories(name),expense_category:finance_expense_categories(name)",
        )
        .is("archived_at", null)
        .order("transaction_date", { ascending: false }),
      r
        .from("finance_invoices")
        .select("*,finance_invoice_payments(*)")
        .is("archived_at", null),
      r
        .from("payroll_entries")
        .select(
          "*,profile:profiles(full_name,employee_code),payroll_run:payroll_runs(period_start,period_end)",
        ),
    ]);
    for (const x of [transactions, invoices, payroll])
      if (x.error) throw x.error;
    return {
      transactions: transactions.data || [],
      invoices: invoices.data || [],
      payroll: payroll.data || [],
    };
  },
  async superAdminDashboard() {
    const r = requireDb();
    const { data: settings, error: settingsError } = await r
      .from("company_attendance_settings")
      .select("timezone")
      .single();
    if (settingsError) throw settingsError;
    const today = dateKey(new Date(), settings.timezone);
    const [
      employees,
      present,
      late,
      onLeave,
      pendingLeave,
      openTasks,
      overdueTasks,
      pendingDocuments,
      unreadNotifications,
      leads,
      newLeads,
      followups,
      hotLeads,
      sales,
    ] = await Promise.all([
      r
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .in("status", operationalEmployeeStatuses)
        .eq("is_employee", true)
        .eq("workforce_visible", true)
        .neq("role", "director"),
      r
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("work_date", today)
        .not("clock_in", "is", null),
      r
        .from("attendance")
        .select("*", { count: "exact", head: true })
        .eq("work_date", today)
        .eq("status", "late"),
      r
        .from("leave_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "approved")
        .lte("starts_on", today)
        .gte("ends_on", today),
      r
        .from("leave_requests")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      r
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .neq("status", "completed"),
      r
        .from("tasks")
        .select("*", { count: "exact", head: true })
        .neq("status", "completed")
        .lt("due_date", today),
      r
        .from("document_requests")
        .select("*", { count: "exact", head: true })
        .in("status", ["requested", "submitted"]),
      r
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .is("read_at", null),
      r
        .from("crm_leads")
        .select("*", { count: "exact", head: true })
        .is("archived_at", null),
      r
        .from("crm_leads")
        .select("*", { count: "exact", head: true })
        .eq("lead_date", today)
        .is("archived_at", null),
      r
        .from("crm_lead_followups")
        .select("*", { count: "exact", head: true })
        .eq("next_follow_up_at", today),
      r
        .from("crm_leads")
        .select("*", { count: "exact", head: true })
        .eq("temperature", "hot")
        .is("archived_at", null),
      r.from("crm_sales").select("*", { count: "exact", head: true }),
    ]);
    const results = [
      employees,
      present,
      late,
      onLeave,
      pendingLeave,
      openTasks,
      overdueTasks,
      pendingDocuments,
      unreadNotifications,
      leads,
      newLeads,
      followups,
      hotLeads,
      sales,
    ];
    const failed = results.find((item: any) => item.error);
    if (failed) throw failed.error;
    return {
      employees: employees.count || 0,
      presentToday: present.count || 0,
      lateToday: late.count || 0,
      onLeave: onLeave.count || 0,
      pendingLeave: pendingLeave.count || 0,
      openTasks: openTasks.count || 0,
      overdueTasks: overdueTasks.count || 0,
      pendingDocuments: pendingDocuments.count || 0,
      unreadNotifications: unreadNotifications.count || 0,
      leads: leads.count || 0,
      newLeads: newLeads.count || 0,
      followupsDue: followups.count || 0,
      hotLeads: hotLeads.count || 0,
      sales: sales.count || 0,
    };
  },
  async employees(
    query = "",
    page = 0,
    size = 10,
    workforce: "current" | "all" = "current",
  ) {
    const r = requireDb();
    const from = page * size;
    const fetch = async (select: string) => {
      let q = r
        .from("profiles")
        .select(select, { count: "exact" })
        .eq("is_employee", true)
        .neq("role", "director")
        .order("full_name")
        .range(from, from + size - 1);
      if (workforce === "current")
        q = q
          .in("status", operationalEmployeeStatuses)
          .eq("workforce_visible", true);
      if (query)
        q = q.or(
          `full_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%,employee_code.ilike.%${query}%`,
        );
      return q;
    };
    let result = await fetch(
      "id,full_name,email,phone,employee_code,role,designation,department_id,manager_id,status,workforce_visible,joining_date,removed_at,removal_reason,removed_by,remover:profiles!profiles_removed_by_fkey(full_name),department:departments(name)",
    );
    if (result.error && employeeRemovalSchemaUnavailable(result.error))
      result = await fetch(
        "id,full_name,email,phone,employee_code,role,designation,department_id,manager_id,status,workforce_visible,joining_date,department:departments(name)",
      );
    if (result.error) throw result.error;
    return { data: result.data as Employee[], count: result.count ?? 0 };
  },
  async employeeProfile(id: string) {
    const r = requireDb();
    const enhanced =
      "id,full_name,email,phone,personal_email,date_of_birth,gender,address,emergency_contact,employee_code,designation,role,status,joining_date,employment_type,avatar_url,department_id,manager_id,login_enabled,removed_at,removal_reason,removed_by,remover:profiles!profiles_removed_by_fkey(full_name),department:departments(name)";
    const legacy =
      "id,full_name,email,phone,personal_email,date_of_birth,gender,address,emergency_contact,employee_code,designation,role,status,joining_date,employment_type,avatar_url,department_id,manager_id,login_enabled,department:departments(name)";
    let result = await r
      .from("profiles")
      .select(enhanced)
      .eq("id", id)
      .single();
    if (result.error && employeeRemovalSchemaUnavailable(result.error))
      result = await r.from("profiles").select(legacy).eq("id", id).single();
    if (result.error) throw result.error;
    const data = result.data;
    let manager = null;
    if (data.manager_id) {
      const managerResult = await r
        .from("profiles")
        .select("full_name")
        .eq("id", data.manager_id)
        .maybeSingle();
      if (managerResult.error) throw managerResult.error;
      manager = managerResult.data;
    }
    return { ...data, manager };
  },
  async employeeWorkspaceStatus(id: string) {
    const r = requireDb();
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 7)}-01`;
    const [
      attendance,
      todayAttendance,
      leaves,
      assignments,
      documentRequests,
      grants,
      payroll,
      audit,
      reports,
    ] = await Promise.all([
      r
        .from("attendance")
        .select("*")
        .eq("profile_id", id)
        .gte("work_date", monthStart)
        .lte("work_date", today)
        .order("work_date", { ascending: false }),
      r
        .from("attendance")
        .select("*")
        .eq("profile_id", id)
        .eq("work_date", today)
        .maybeSingle(),
      r
        .from("leave_requests")
        .select("*,leave_types(name)")
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(12),
      r
        .from("task_assignments")
        .select("*,tasks(*)")
        .eq("profile_id", id)
        .order("updated_at", { ascending: false }),
      r
        .from("document_requests")
        .select("*,document_submissions(*)")
        .eq("profile_id", id)
        .order("created_at", { ascending: false }),
      r
        .from("user_permission_grants")
        .select(
          "*,permission:permissions(code,description),granter:profiles!user_permission_grants_granted_by_fkey(full_name)",
        )
        .eq("profile_id", id)
        .order("granted_at", { ascending: false }),
      r
        .from("payroll_entries")
        .select("*,payroll_run:payroll_runs(period_start,period_end,status)")
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(6),
      r
        .from("employee_activity_logs")
        .select(
          "id,action,changes,created_at,actor_id,actor:profiles!employee_activity_logs_actor_id_fkey(full_name)",
        )
        .eq("profile_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      r
        .from("profiles")
      .select("id,full_name,designation,role")
      .eq("manager_id", id)
      .eq("is_employee", true)
      .eq("workforce_visible", true)
      .neq("role", "director")
      .eq("login_enabled", true)
        .in("status", operationalEmployeeStatuses)
        .order("full_name"),
    ]);
    for (const result of [
      attendance,
      todayAttendance,
      leaves,
      assignments,
      documentRequests,
      grants,
      payroll,
      audit,
      reports,
    ])
      if (result.error) throw result.error;
    const activityRows = audit.data || [];
    const relationIds = (field: string) => [
      ...new Set(
        activityRows.flatMap((row: any) => {
          const change = row.changes?.[field];
          return [change?.from, change?.to].filter(Boolean);
        }),
      ),
    ];
    const departmentIds = relationIds("department_id");
    const managerIds = relationIds("manager_id");
    const [activityDepartments, activityManagers] = await Promise.all([
      departmentIds.length
        ? r.from("departments").select("id,name").in("id", departmentIds)
        : { data: [], error: null },
      managerIds.length
        ? r
            .from("profiles")
            .select("id,full_name,employee_code")
            .in("id", managerIds)
        : { data: [], error: null },
    ]);
    if (activityDepartments.error) throw activityDepartments.error;
    if (activityManagers.error) throw activityManagers.error;
    const departmentNames = new Map(
      (activityDepartments.data || []).map((item: any) => [item.id, item.name]),
    );
    const managerNames = new Map(
      (activityManagers.data || []).map((item: any) => [
        item.id,
        [item.full_name, item.employee_code].filter(Boolean).join(" · "),
      ]),
    );
    const activity = activityRows.map((row: any) => ({
      ...row,
      changes: Object.fromEntries(
        Object.entries(row.changes || {}).map(([field, value]: any) => {
          const label =
            field === "department_id"
              ? "department"
              : field === "manager_id"
                ? "reporting_manager"
                : field;
          const format = (raw: any) =>
            !raw
              ? raw
              : field === "department_id"
                ? departmentNames.get(raw) || raw
                : field === "manager_id"
                  ? managerNames.get(raw) || raw
                  : raw;
          return [
            label,
            { ...value, from: format(value?.from), to: format(value?.to) },
          ];
        }),
      ),
    }));
    return {
      attendance: attendance.data || [],
      todayAttendance: todayAttendance.data || null,
      leaves: leaves.data || [],
      tasks: assignments.data || [],
      documents: documentRequests.data || [],
      grants: grants.data || [],
      payroll: payroll.data || [],
      activity,
      directReports: reports.data || [],
    };
  },
  async employeeStatusHistory(id: string) {
    const { data, error } = await requireDb()
      .from("employee_status_history")
      .select(
        "id,previous_status,next_status,reason,created_at,changed_by,actor:profiles!employee_status_history_changed_by_fkey(full_name)",
      )
      .eq("profile_id", id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return data || [];
  },
  async departments() {
    const { data, error } = await requireDb()
      .from("departments")
      .select("id,name")
      .order("name");
    if (error) throw error;
    return data as Department[];
  },
  async designations() {
    const { data, error } = await requireDb()
      .from("designations")
      .select("id,name,department_id")
      .order("name");
    if (error) throw error;
    return data as Designation[];
  },
  async createDepartment(name: string) {
    const { error } = await requireDb().from("departments").insert({ name });
    if (error) throw error;
  },
  async createDesignation(name: string, department_id: string) {
    const { error } = await requireDb()
      .from("designations")
      .insert({ name, department_id: department_id || null });
    if (error) throw error;
  },
  async updateEmployee(id: string, patch: Partial<Employee>) {
    const r = requireDb();
    const { data: existing, error: existingError } = await r
      .from("profiles")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (existingError)
      throw new Error("Employee lookup failed. Please try again.");
    if (!existing) throw new Error("Employee not found.");
    const { data, error } = await r
      .from("profiles")
      .update(patch)
      .eq("id", id)
      .select("id,joining_date,status")
      .maybeSingle();
    if (error) {
      if (error.code === "42501")
        throw new Error("You do not have permission to update this employee.");
      throw error;
    }
    if (!data)
      throw new Error("You do not have permission to update this employee.");
    return data;
  },
  async changeEmployeeStatus(
    id: string,
    status:
      | "active"
      | "inactive"
      | "on_leave"
      | "intern"
      | "probation"
      | "resigned"
      | "terminated",
    reason: string,
  ) {
    const { data, error } = await requireDb().rpc("change_employee_status", {
      target_profile: id,
      next_status: status,
      change_reason: reason.trim() || null,
    });
    if (error) {
      if (error.code === "42501")
        throw new Error(
          "You do not have permission to change this employee status.",
        );
      if (error.code === "P0002") throw new Error("Employee not found.");
      throw error;
    }
    return data;
  },
  async removeEmployee(id: string, reason: string) {
    const { data, error } = await requireDb().rpc("remove_employee", {
      target_profile: id,
      removal_reason: reason,
    });
    if (error) {
      if (error.code === "42501")
        throw new Error(
          error.message?.includes("own")
            ? "You cannot remove your own employee account."
            : "You do not have permission to remove this employee.",
        );
      if (error.code === "P0002") throw new Error("Employee not found.");
      throw error;
    }
    return data;
  },
  async restoreEmployee(id: string, reason = "Restored to current workforce") {
    const { data, error } = await requireDb().rpc("restore_employee", {
      target_profile: id,
      restore_reason: reason,
    });
    if (error) {
      if (error.code === "42501")
        throw new Error(
          error.message?.includes("own")
            ? "You cannot restore your own employee account."
            : "You do not have permission to restore this employee.",
        );
      if (error.code === "P0002") throw new Error("Employee not found.");
      throw error;
    }
    return data;
  },
  async deactivateEmployee(id: string) {
    const { error } = await requireDb()
      .from("profiles")
      .update({ status: "inactive" })
      .eq("id", id);
    if (error) throw error;
  },
  async leaveRequests() {
    const { data, error } = await requireDb()
      .from("leave_requests")
      .select(
        "*,employee:profiles!leave_requests_profile_id_fkey(full_name,email,employee_code,designation,role),leave_types(name),leave_approval_events(*)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async reviewLeaveRequest(
    id: string,
    status: "approved" | "rejected",
    approval_comment: string,
  ) {
    const { data, error } = await requireDb().rpc("review_leave_request", {
      target_request: id,
      decision: status,
      review_comment: approval_comment.trim() || null,
    });
    if (error) {
      if (error.code === "42501")
        throw new Error("You are not authorized to review this leave request.");
      if (error.code === "P0002")
        throw new Error("This leave request is no longer available.");
      if (error.code === "P0001")
        throw new Error(
          error.message || "This leave request has already been reviewed.",
        );
      throw error;
    }
    return data;
  },
  async audit() {
    const { data, error } = await requireDb()
      .from("audit_logs")
      .select("id,action,entity_type,created_at,actor_id")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    return data as AuditLog[];
  },
  async accessCatalogue() {
    const r = requireDb();
    const [roles, permissions, grants, employees, audit] = await Promise.all([
      r.from("roles").select("id,code,name").order("name"),
      r.from("permissions").select("id,code,description").order("code"),
      r
        .from("user_permission_grants")
        .select(
          "*,profile:profiles!user_permission_grants_profile_id_fkey(id,full_name,email,status,role,department:departments(name)),granter:profiles!user_permission_grants_granted_by_fkey(full_name),permission:permissions!user_permission_grants_permission_id_fkey(id,code,description)",
        )
        .order("granted_at", { ascending: false }),
      r
        .from("profiles")
        .select("id,full_name,email,status,role,department:departments(name)")
        .eq("is_employee", true)
        .eq("workforce_visible", true)
        .neq("role", "director")
        .eq("login_enabled", true)
        .eq("status", "active")
        .order("full_name"),
      r
        .from("audit_logs")
        .select(
          "id,action,entity_type,entity_id,actor_id,created_at,before_data,after_data",
        )
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    for (const result of [roles, permissions, grants, employees])
      if (result.error) throw result.error;
    let rolePermissions = await r
      .from("role_permissions")
      .select("role_id,permission_id");
    let rolePermissionMode: "id" | "legacy" = "id";
    if (rolePermissions.error) {
      const legacy = await r
        .from("role_permissions")
        .select("role,permission_id");
      if (legacy.error) throw legacy.error;
      rolePermissionMode = "legacy";
      rolePermissions = {
        data: (legacy.data || []).map((item: any) => ({
          role_key: item.role,
          permission_id: item.permission_id,
        })),
        error: null,
      } as any;
    } else
      rolePermissions = {
        data: (rolePermissions.data || []).map((item: any) => ({
          role_key: item.role_id,
          permission_id: item.permission_id,
        })),
        error: null,
      } as any;
    return {
      roles: roles.data || [],
      permissions: permissions.data || [],
      rolePermissions: rolePermissions.data || [],
      rolePermissionMode,
      grants: grants.data || [],
      employees: employees.data || [],
      audit: audit.error ? [] : audit.data || [],
    };
  },
  async setRolePermission(
    roleKey: string,
    permissionId: string,
    enabled: boolean,
    mode: "id" | "legacy" = "id",
  ) {
    const r = requireDb();
    if (mode === "legacy") {
      if (enabled) {
        const { error } = await r
          .from("role_permissions")
          .upsert({ role: roleKey, permission_id: permissionId });
        if (error) throw error;
      } else {
        const { error } = await r
          .from("role_permissions")
          .delete()
          .eq("role", roleKey)
          .eq("permission_id", permissionId);
        if (error) throw error;
      }
      return;
    }
    if (enabled) {
      const { error } = await r
        .from("role_permissions")
        .upsert({ role_id: roleKey, permission_id: permissionId });
      if (error) throw error;
    } else {
      const { error } = await r
        .from("role_permissions")
        .delete()
        .eq("role_id", roleKey)
        .eq("permission_id", permissionId);
      if (error) throw error;
    }
  },
  async grantPermission(payload: {
    profile_id: string;
    permission_id: string;
    granted_by: string;
    starts_at: string;
    expires_at: string | null;
    reason: string;
  }) {
    const target = await this.activeEmployeeByEmailOrId(payload.profile_id);
    if (!target || target.status !== "active")
      throw new Error("Access can only be granted to an active employee.");
    const { data, error } = await requireDb()
      .from("user_permission_grants")
      .insert({
        ...payload,
        expires_at: payload.expires_at || null,
        reason: payload.reason || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async activeEmployeeByEmailOrId(value: string) {
    const r = requireDb();
    const { data, error } = await r
      .from("profiles")
      .select("id,full_name,email,status")
      .eq("is_employee", true)
      .eq("workforce_visible", true)
      .neq("role", "director")
      .eq("login_enabled", true)
      .eq("status", "active")
      .or(`id.eq.${value},email.ilike.${value}`)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async revokePermission(id: string, revoked_by: string) {
    const { data, error } = await requireDb()
      .from("user_permission_grants")
      .update({ revoked_at: new Date().toISOString(), revoked_by })
      .eq("id", id)
      .is("revoked_at", null)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async taskPermissionGrants() {
    const { data, error } = await requireDb()
      .from("user_permission_grants")
      .select(
        "*,profile:profiles!user_permission_grants_profile_id_fkey(id,full_name,email,status),granter:profiles!user_permission_grants_granted_by_fkey(full_name),permission:permissions!user_permission_grants_permission_id_fkey(code)",
      )
      .order("granted_at", { ascending: false });
    if (error) throw error;
    return (data || []).filter((grant: any) =>
      ["tasks.assign", "tasks.manage_access"].includes(grant.permission?.code),
    );
  },
  async recordExpiredTaskPermissions() {
    const { error } = await requireDb().rpc("record_expired_task_permissions");
    if (error) throw error;
  },
  async activeEmployeeByEmail(email: string) {
    const { data, error } = await requireDb()
      .from("profiles")
      .select("id,full_name,email,status")
      .eq("is_employee", true)
      .eq("workforce_visible", true)
      .neq("role", "director")
      .eq("login_enabled", true)
      .eq("status", "active")
      .ilike("email", email.trim())
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  async searchActiveEmployees(query: string) {
    const term = query.trim();
    if (!term) return [];
    const { data, error } = await requireDb()
      .from("profiles")
      .select("id,full_name,email,status")
      .eq("is_employee", true)
      .eq("workforce_visible", true)
      .neq("role", "director")
      .eq("login_enabled", true)
      .in("status", operationalEmployeeStatuses)
      .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
      .order("full_name")
      .limit(10);
    if (error) throw error;
    return data;
  },
  async grantTaskPermission(payload: {
    profile_id: string;
    permissionCode: "tasks.assign" | "tasks.manage_access";
    granted_by: string;
    starts_at: string;
    expires_at: string | null;
    reason: string;
  }) {
    const r = requireDb();
    const { data: permission, error: permissionError } = await r
      .from("permissions")
      .select("id")
      .eq("code", payload.permissionCode)
      .single();
    if (permissionError) throw permissionError;
    const { data, error } = await r
      .from("user_permission_grants")
      .insert({
        profile_id: payload.profile_id,
        permission_id: permission.id,
        granted_by: payload.granted_by,
        starts_at: payload.starts_at,
        expires_at: payload.expires_at || null,
        reason: payload.reason || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async revokeTaskPermission(id: string, revoked_by: string) {
    const { data, error } = await requireDb()
      .from("user_permission_grants")
      .update({ revoked_at: new Date().toISOString(), revoked_by })
      .eq("id", id)
      .is("revoked_at", null)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async tasks(
    filters: {
      employee?: string;
      status?: string;
      priority?: string;
      dueDate?: string;
    } = {},
  ) {
    const r = requireDb();
    let q = r.from("tasks").select("*").order("due_date");
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.priority) q = q.eq("priority", filters.priority);
    if (filters.dueDate) q = q.eq("due_date", filters.dueDate);
    const { data: tasks, error } = await q;
    if (error) throw new Error("Tasks could not be loaded. Please try again.");
    const ids = (tasks || []).map((task: any) => task.id);
    if (!ids.length) return [];
    const [
      { data: assignments, error: assignmentError },
      { data: comments, error: commentError },
    ] = await Promise.all([
      r
        .from("task_assignments")
        .select("id,task_id,profile_id,status,updated_at")
        .in("task_id", ids),
      r
        .from("task_comments")
        .select("id,task_id,author_id,body,created_at")
        .in("task_id", ids)
        .order("created_at"),
    ]);
    if (assignmentError || commentError)
      throw new Error("Tasks could not be loaded. Please try again.");
    const peopleIds = [
      ...new Set(
        [
          ...(assignments || []).map((item: any) => item.profile_id),
          ...(comments || []).map((item: any) => item.author_id),
          ...(tasks || []).map((item: any) => item.created_by),
        ].filter(Boolean),
      ),
    ];
    const { data: people, error: peopleError } = peopleIds.length
      ? await r.from("profiles").select("id,full_name").in("id", peopleIds)
      : { data: [], error: null };
    if (peopleError)
      throw new Error("Tasks could not be loaded. Please try again.");
    const names = new Map(
      (people || []).map((person: any) => [person.id, person]),
    );
    const mapped = (tasks || []).map((task: any) => ({
      ...task,
      created_by_profile: names.get(task.created_by) || null,
      task_assignments: (assignments || [])
        .filter((item: any) => item.task_id === task.id)
        .map((item: any) => ({
          ...item,
          profile: names.get(item.profile_id) || null,
        })),
      task_comments: (comments || [])
        .filter((item: any) => item.task_id === task.id)
        .map((item: any) => ({
          ...item,
          author_profile: names.get(item.author_id) || null,
        })),
    }));
    return filters.employee
      ? mapped.filter((task: any) =>
          task.task_assignments.some(
            (assignment: any) => assignment.profile_id === filters.employee,
          ),
        )
      : mapped;
  },
  async createTask(payload: {
    title: string;
    description: string;
    priority: string;
    due_date: string;
    assigneeIds: string[];
    created_by: string;
  }) {
    const r = requireDb();
    const { data, error } = await r
      .from("tasks")
      .insert({
        title: payload.title,
        description: payload.description || null,
        priority: payload.priority,
        due_date: payload.due_date || null,
        created_by: payload.created_by,
        assignee_id: payload.assigneeIds[0] || null,
        status: "todo",
      })
      .select()
      .single();
    if (error) throw error;
    const assignments = await r
      .from("task_assignments")
      .insert(
        payload.assigneeIds.map((profile_id) => ({
          task_id: data.id,
          profile_id,
          status: "todo",
        })),
      );
    if (assignments.error) {
      await r.from("tasks").delete().eq("id", data.id);
      throw new Error(
        "Task could not be assigned to the selected employee. Choose an employee within your permitted scope.",
      );
    }
    return data;
  },
  async updateTask(
    id: string,
    payload: {
      title: string;
      description: string;
      priority: string;
      due_date: string;
      status: string;
    },
  ) {
    const { data, error } = await requireDb()
      .from("tasks")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async setTaskAssignees(taskId: string, assigneeIds: string[]) {
    const r = requireDb();
    const { data: current, error: currentError } = await r
      .from("task_assignments")
      .select("id,profile_id")
      .eq("task_id", taskId);
    if (currentError) throw currentError;
    const wanted = [...new Set(assigneeIds)];
    const remove = (current || []).filter(
      (item: any) => !wanted.includes(item.profile_id),
    );
    if (remove.length) {
      const deleted = await r
        .from("task_assignments")
        .delete()
        .in(
          "id",
          remove.map((item: any) => item.id),
        );
      if (deleted.error) throw deleted.error;
    }
    const existing = new Set(
      (current || []).map((item: any) => item.profile_id),
    );
    const additions = wanted.filter((id) => !existing.has(id));
    if (additions.length) {
      const inserted = await r
        .from("task_assignments")
        .insert(
          additions.map((profile_id) => ({
            task_id: taskId,
            profile_id,
            status: "todo",
          })),
        );
      if (inserted.error) throw inserted.error;
    }
  },
  async setTaskStatus(
    id: string,
    status: "todo" | "in_progress" | "completed",
  ) {
    const r = requireDb();
    const assignments = await r
      .from("task_assignments")
      .update({ status })
      .eq("task_id", id)
      .select("id");
    if (assignments.error) throw assignments.error;
    const { data, error } = await r
      .from("tasks")
      .update({ status })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async deleteTask(id: string) {
    const { data, error } = await requireDb().rpc("delete_managed_task", {
      target_task: id,
    });
    if (error) throw error;
    return data;
  },
  async documents() {
    const { data, error } = await requireDb()
      .from("documents")
      .select("*,document_shares(*)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async documentRequests() {
    const { data, error } = await requireDb()
      .from("document_requests")
      .select(
        "*,employee:profiles!document_requests_profile_id_fkey(full_name),document_submissions(*)",
      )
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createCompanyDocument(payload: {
    title: string;
    description: string;
    category: string;
    expiry_date?: string;
    storage_path: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    uploaded_by: string;
    profileIds: string[];
  }) {
    const r = requireDb();
    const { profileIds, ...document } = payload;
    const { data, error } = await r
      .from("documents")
      .insert({ ...document, expiry_date: document.expiry_date || null })
      .select()
      .single();
    if (error) throw error;
    const shares = profileIds.length
      ? profileIds.map((profile_id) => ({
          document_id: data.id,
          profile_id,
          shared_with_all: false,
        }))
      : [{ document_id: data.id, profile_id: null, shared_with_all: true }];
    const result = await r.from("document_shares").insert(shares);
    if (result.error) throw result.error;
    return data;
  },
  async requestDocument(payload: {
    title: string;
    description: string;
    due_date: string;
    profile_id: string;
    requested_by: string;
  }) {
    const { data, error } = await requireDb()
      .from("document_requests")
      .insert({ ...payload, due_date: payload.due_date || null })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async reviewDocumentRequest(
    id: string,
    status: "approved" | "rejected",
    admin_comment: string,
    reviewerId: string,
  ) {
    const { data, error } = await requireDb()
      .from("document_requests")
      .update({
        status,
        admin_comment: admin_comment || null,
        reviewer_id: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async uploadCompanyDocument(userId: string, file: File) {
    const fileError = documentFileValidationMessage(file);
    if (fileError) throw Error(fileError);
    const path = `company/${userId}/${crypto.randomUUID()}-${file.name}`;
    const { error } = await requireDb()
      .storage.from("employee-documents")
      .upload(path, file);
    if (error) throw error;
    return {
      path,
      fileName: file.name,
      mimeType: file.type || "",
      fileSize: file.size,
    };
  },
  async announcements() {
    const { data, error } = await requireDb()
      .from("announcements")
      .select("*,announcement_recipients(*),announcement_reads(count)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createAnnouncement(payload: {
    title: string;
    body: string;
    category: string;
    status: string;
    is_pinned: boolean;
    audience_type: string;
    department_id: string | null;
    published_at: string | null;
    expires_at: string | null;
    author_id: string;
    profileIds: string[];
  }) {
    const r = requireDb();
    const { profileIds, ...announcement } = payload;
    const { data, error } = await r
      .from("announcements")
      .insert({
        ...announcement,
        published_at: announcement.published_at || new Date().toISOString(),
        expires_at: announcement.expires_at || null,
      })
      .select()
      .single();
    if (error) throw error;
    if (announcement.audience_type === "employees" && profileIds.length) {
      const shares = await r
        .from("announcement_recipients")
        .insert(
          profileIds.map((profile_id) => ({
            announcement_id: data.id,
            profile_id,
          })),
        );
      if (shares.error) throw shares.error;
    }
    return data;
  },
  async updateAnnouncement(
    id: string,
    payload: {
      title: string;
      body: string;
      category: string;
      status: string;
      is_pinned: boolean;
      expires_at: string | null;
    },
  ) {
    const { data, error } = await requireDb()
      .from("announcements")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async archiveAnnouncement(id: string) {
    const { error } = await requireDb()
      .from("announcements")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) throw error;
  },
  async notifications() {
    const { data, error } = await requireDb()
      .from("notifications")
      .select("*,recipient:profiles!notifications_profile_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return data;
  },
  async crmLookups() {
    const r = requireDb();
    const [sources, statuses] = await Promise.all([
      r
        .from("crm_lead_sources")
        .select("*")
        .eq("is_active", true)
        .order("name"),
      r
        .from("crm_lead_statuses")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
    ]);
    if (sources.error) throw sources.error;
    if (statuses.error) throw statuses.error;
    return { sources: sources.data, statuses: statuses.data };
  },
  async crmLeads() {
    const { data, error } = await requireDb()
      .from("crm_leads")
      .select(
        "*,source:crm_lead_sources(name),status:crm_lead_statuses(name),assignee:profiles!crm_leads_assigned_to_fkey(full_name),converted_patient:patients!crm_leads_converted_patient_id_fkey(id,slug,patient_number,full_name),crm_lead_followups(*),crm_sales(*)",
      )
      .is("archived_at", null)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data;
  },
  async createLead(payload: any) {
    const { data, error } = await requireDb()
      .from("crm_leads")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async addLeadFollowup(payload: any) {
    const { data, error } = await requireDb()
      .from("crm_lead_followups")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async convertLead(payload: any) {
    const r = requireDb();
    const { data, error } = await r
      .from("crm_sales")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    const update = await r
      .from("crm_leads")
      .update({ converted_at: new Date().toISOString() })
      .eq("id", payload.lead_id);
    if (update.error) throw update.error;
    return data;
  },
  async crmLead(id: string) {
    const { data, error } = await requireDb()
      .from("crm_leads")
      .select(
        "*,source:crm_lead_sources(name),status:crm_lead_statuses(name),assignee:profiles!crm_leads_assigned_to_fkey(full_name),converted_patient:patients!crm_leads_converted_patient_id_fkey(id,slug,patient_number,full_name),crm_lead_followups(*,profiles(full_name)),crm_sales(*)",
      )
      .eq("id", id)
      .single();
    if (error) throw error;
    return data;
  },
  async convertLeadToPatient(leadId: string, patientNumber: string) {
    const { data, error } = await requireDb().rpc("convert_lead_to_patient", {
      target_lead: leadId,
      requested_patient_number: patientNumber.trim(),
    });
    if (error) throw error;
    return Array.isArray(data) ? data[0] : data;
  },
  async updateLead(id: string, patch: any) {
    const { data, error } = await requireDb()
      .from("crm_leads")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async archiveLead(id: string) {
    const { data, error } = await requireDb()
      .from("crm_leads")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id)
      .is("archived_at", null)
      .select("id,archived_at")
      .single();
    if (error) throw error;
    if (!data?.archived_at)
      throw new Error("Lead archive did not persist. Refresh and try again.");
    return data;
  },
  async crmSales() {
    const { data, error } = await requireDb()
      .from("crm_sales")
      .select(
        "*,crm_leads(full_name,phone,assigned_to,assignee:profiles!crm_leads_assigned_to_fkey(full_name),source:crm_lead_sources(name))",
      )
      .order("closing_date", { ascending: false });
    if (error) throw error;
    return data;
  },
  async updateSale(id: string, patch: any) {
    const { data, error } = await requireDb()
      .from("crm_sales")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async createCrmImportBatch(payload: any) {
    const { data, error } = await requireDb()
      .from("crm_import_batches")
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  },
  async updateCrmImportBatch(id: string, patch: any) {
    const { error } = await requireDb()
      .from("crm_import_batches")
      .update(patch)
      .eq("id", id);
    if (error) throw error;
  },
  async createCrmImportRows(rows: any[]) {
    const { error } = await requireDb().from("crm_import_rows").insert(rows);
    if (error) throw error;
  },
  async findCrmLead(full_name: string, phone: string) {
    const { data, error } = await requireDb()
      .from("crm_leads")
      .select("id")
      .eq("phone", phone)
      .ilike("full_name", full_name)
      .limit(1);
    if (error) throw error;
    return data?.[0] ?? null;
  },
};
