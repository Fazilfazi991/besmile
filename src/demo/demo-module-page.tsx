"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { demoDirectorDashboardData, demoDirectorModules } from "./demo-director-data";

const titleFor = (path: string) => {
  const labels: Record<string, string> = {
    "/admin/attendance": "Staff Attendance",
    "/admin/leaves": "Leave Approvals",
    "/admin/tasks": "Tasks",
    "/admin/notifications": "Notifications",
    "/admin/doctor-scheduling": "Appointment & Scheduling",
    "/admin/crm": "CRM Dashboard",
    "/admin/crm/leads": "Leads Management",
    "/admin/crm/follow-ups": "Follow-ups",
    "/admin/crm/sales": "Sales",
    "/admin/finance": "Finance Dashboard",
    "/admin/finance/income": "Income",
    "/admin/finance/expenses": "Expenses",
    "/admin/finance/invoices": "Invoices",
    "/admin/finance/payroll": "Payroll",
    "/admin/finance/psychologist-payments": "Psychologist Payments",
    "/admin/finance/reports": "Finance Reports",
  };
  return labels[path] || path.split("/").filter(Boolean).at(-1)?.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Director module";
};

const money = (value: number) => `INR ${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value)}`;

export function DemoModulePage({ initialPath = "/admin" }: { initialPath?: string }) {
  const params = useSearchParams();
  const path = params.get("from") || initialPath;
  const title = titleFor(path);
  const [tasks, setTasks] = useState(demoDirectorModules.tasks);
  const [leaves, setLeaves] = useState(demoDirectorModules.leaveRequests);
  const [notifications, setNotifications] = useState(demoDirectorModules.notifications);
  const [query, setQuery] = useState("");

  const leads = useMemo(() => demoDirectorDashboardData.leads.filter((lead) => `${lead.full_name} ${lead.status.name}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const invoices = demoDirectorDashboardData.invoices;
  const rows = demoDirectorDashboardData.finance.monthly;

  const header = <div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Director workspace · synthetic demo</p><h1 className="text-2xl font-bold capitalize">{title}</h1><p className="mt-1 text-slate-600">Explore the real Director module structure with local fictional data. Changes reset when the page reloads.</p></div><Link className="btn border" href="/admin">Back to overview</Link></div>;
  const table = (children: React.ReactNode) => <div className="card overflow-x-auto"><table className="min-w-full text-sm">{children}</table></div>;

  if (path.includes("/crm")) return <section className="space-y-5">{header}<div className="grid gap-3 sm:grid-cols-3"><div className="metric-card"><p>Active leads</p><b>{leads.length}</b><small>Filtered synthetic records</small></div><div className="metric-card"><p>Follow-ups due</p><b>{demoDirectorDashboardData.summary.followupsDue}</b><small>Local demo activity</small></div><div className="metric-card"><p>Sales</p><b>{demoDirectorDashboardData.summary.sales}</b><small>Conversion events</small></div></div><div className="card p-4"><input aria-label="Search demo leads" className="w-full rounded border p-2" placeholder="Search leads or stages" value={query} onChange={(event) => setQuery(event.target.value)} /></div>{table(<><thead className="border-b text-left text-slate-500"><tr><th className="p-3">Prospect</th><th className="p-3">Stage</th><th className="p-3">Temperature</th><th className="p-3">Lead date</th><th className="p-3">Action</th></tr></thead><tbody>{leads.slice(0, 12).map((lead) => <tr className="border-b" key={lead.id}><td className="p-3 font-medium">{lead.full_name}</td><td className="p-3">{lead.status.name}</td><td className="p-3 capitalize">{lead.temperature}</td><td className="p-3">{lead.lead_date}</td><td className="p-3"><button className="text-button" type="button" onClick={() => window.alert("Lead stage changes are simulated locally in this demo.")}>Mark contacted</button></td></tr>)}</tbody></>)}</section>;

  if (path.includes("/finance")) return <section className="space-y-5">{header}<div className="grid gap-3 sm:grid-cols-3"><div className="metric-card"><p>Income</p><b>{money(rows.filter((row) => ["income", "invoice_payment"].includes(row.transaction_type)).reduce((sum, row) => sum + row.amount, 0))}</b><small>Six synthetic months</small></div><div className="metric-card"><p>Outstanding invoices</p><b>{money(128500)}</b><small>{invoices.length} open balances</small></div><div className="metric-card"><p>Net result</p><b>{money(66000)}</b><small>Current demo period</small></div></div>{table(<><thead className="border-b text-left text-slate-500"><tr><th className="p-3">Reference</th><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Amount</th><th className="p-3">Status</th></tr></thead><tbody>{(path.includes("invoices") ? invoices : rows).slice(0, 10).map((row: any) => <tr className="border-b" key={row.id}><td className="p-3 font-medium">{row.id}</td><td className="p-3">{row.due_date || row.transaction_date}</td><td className="p-3">{row.status || row.transaction_type}</td><td className="p-3">{money(row.amount || row.finance_invoice_items?.[0]?.rate || 18000)}</td><td className="p-3">{row.status || "Recorded"}</td></tr>)}</tbody></>)}</section>;

  if (path.includes("attendance")) return <section className="space-y-5">{header}{table(<><thead className="border-b text-left text-slate-500"><tr><th className="p-3">Employee</th><th className="p-3">Department</th><th className="p-3">Status</th><th className="p-3">Clock in</th></tr></thead><tbody>{demoDirectorModules.attendance.map((row) => <tr className="border-b" key={row.id}><td className="p-3 font-medium">{row.full_name}</td><td className="p-3">{row.department?.name}</td><td className="p-3">{row.on_leave ? "On leave" : row.attendance?.status || "Not clocked in"}</td><td className="p-3">{row.attendance?.clock_in ? "9:00 AM" : "—"}</td></tr>)}</tbody></>)}</section>;

  if (path.includes("leaves")) return <section className="space-y-5">{header}{table(<><thead className="border-b text-left text-slate-500"><tr><th className="p-3">Employee</th><th className="p-3">Dates</th><th className="p-3">Reason</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{leaves.map((leave) => <tr className="border-b" key={leave.id}><td className="p-3 font-medium">{leave.employee.full_name}</td><td className="p-3">{leave.starts_on} – {leave.ends_on}</td><td className="p-3">{leave.reason}</td><td className="p-3">{leave.status}</td><td className="p-3">{leave.status === "pending" ? <div className="flex gap-2"><button className="text-button" type="button" onClick={() => setLeaves((items) => items.map((item) => item.id === leave.id ? { ...item, status: "approved" } : item))}>Approve</button><button className="text-button" type="button" onClick={() => setLeaves((items) => items.map((item) => item.id === leave.id ? { ...item, status: "rejected" } : item))}>Reject</button></div> : "Reviewed"}</td></tr>)}</tbody></>)}</section>;

  if (path.includes("tasks")) return <section className="space-y-5">{header}{table(<><thead className="border-b text-left text-slate-500"><tr><th className="p-3">Task</th><th className="p-3">Assignee</th><th className="p-3">Priority</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{tasks.map((task) => <tr className="border-b" key={task.id}><td className="p-3 font-medium">{task.title}</td><td className="p-3">{task.assignee.full_name}</td><td className="p-3 capitalize">{task.priority}</td><td className="p-3">{task.status}</td><td className="p-3">{task.status !== "completed" ? <button className="text-button" type="button" onClick={() => setTasks((items) => items.map((item) => item.id === task.id ? { ...item, status: "completed" } : item))}>Mark complete</button> : "Complete"}</td></tr>)}</tbody></>)}</section>;

  if (path.includes("notifications")) return <section className="space-y-5">{header}<div className="card divide-y">{notifications.map((item) => <div className="flex flex-wrap items-start justify-between gap-3 p-4" key={item.id}><div><b>{item.title}</b><p className="text-sm text-slate-600">{item.body}</p><small>{item.created_at}</small></div>{!item.read_at && <button className="text-button" type="button" onClick={() => setNotifications((items) => items.map((entry) => entry.id === item.id ? { ...entry, read_at: new Date().toISOString() } : entry))}>Mark read</button>}</div>)}</div></section>;

  if (path.includes("doctor-scheduling")) return <section className="space-y-5">{header}{table(<><thead className="border-b text-left text-slate-500"><tr><th className="p-3">Time</th><th className="p-3">Client</th><th className="p-3">Clinician</th><th className="p-3">Care focus</th><th className="p-3">Status</th></tr></thead><tbody>{demoDirectorModules.appointments.map((appointment) => <tr className="border-b" key={appointment.id}><td className="p-3 font-medium">{appointment.date} · {appointment.time}</td><td className="p-3">{appointment.patient}</td><td className="p-3">{appointment.clinician}</td><td className="p-3">{appointment.treatment}</td><td className="p-3">{appointment.status}</td></tr>)}</tbody></>)}</section>;

  return <section className="space-y-5">{header}<div className="card border-amber-200 bg-amber-50 p-5"><h2 className="font-semibold text-amber-950">This module is not included in the public demo yet.</h2><p className="mt-2 text-sm text-amber-900">The original Director route is preserved in the navigation, but backend-connected actions are intentionally unavailable here. Other modules remain fully explorable with synthetic data.</p></div></section>;
}
