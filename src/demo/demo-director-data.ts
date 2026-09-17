import { demoAppointments, demoPatients, demoUser } from './demo-data';
import { navigationPermissionCodes } from '@/lib/permission-access';

/** Demo-only capability set. Production permissions are resolved from Supabase. */
export const demoDirectorPermissions = new Set(navigationPermissionCodes);

const departments = ['Clinical Services', 'Client Success', 'Operations', 'Finance'];
const clinicianNames = ['Dr. Aisha Rahman', 'Dr. Daniel Carter', 'Maya Patel', 'Dr. Noor Hassan', 'Leah Morgan', 'Samir Cole'];
const employeeNames = ['Alex Morgan', 'Jamie Brooks', 'Priya Shah', 'Ethan Cole', 'Nora Ellis', 'Omar Reed', 'Sofia Lane', 'Milo Hart', 'Ivy Stone', 'Luca Wells'];

export const demoDirectorClients = [
  ...demoPatients.map((patient, index) => ({
    ...patient,
    phone: undefined,
    email: `client-${index + 1}@example.com`,
    assigned: { full_name: patient.clinician },
  })),
  ...['Mira Rowan', 'Caleb West', 'Aria Bloom', 'Rohan Vale', 'Tessa Ford', 'Eli Mercer', 'Sana Quinn', 'Remy Hart', 'Lena Cross', 'Noah Wren'].map((name, index) => ({
    id: `demo-client-${index + 11}`,
    slug: `demo-${name.toLowerCase().replaceAll(' ', '-')}`,
    patient_number: `DEMO-PAT-${String(index + 11).padStart(3, '0')}`,
    full_name: name,
    age: 24 + index,
    status: ['Active care', 'Review due', 'New intake'][index % 3],
    treatment: ['Resilience coaching', 'Workplace wellbeing', 'Initial consultation'][index % 3],
    clinician: clinicianNames[index % clinicianNames.length],
    nextAppointment: `${18 + (index % 8)} Sep, ${9 + (index % 7)}:00 AM`,
    notes: 2 + (index % 6),
    progress: 32 + ((index * 7) % 55),
    source: ['Website', 'Referral', 'Community'][index % 3],
    phone: undefined,
    email: `client-${index + 11}@example.com`,
    assigned: { full_name: clinicianNames[index % clinicianNames.length] },
  })),
];

export const demoDirectorEmployees = employeeNames.map((full_name, index) => ({
  id: `demo-employee-${index + 1}`,
  full_name,
  email: `${full_name.toLowerCase().replaceAll(' ', '.')}@example.com`,
  phone: undefined,
  employee_code: `DEMO-EMP-${String(index + 1).padStart(3, '0')}`,
  role: index === 0 ? 'director' : index % 3 === 0 ? 'clinician' : 'staff',
  designation: index === 0 ? 'Director' : index % 3 === 0 ? 'Clinician' : 'Operations Specialist',
  status: index === 5 ? 'on_leave' : index === 8 ? 'probation' : 'active',
  workforce_visible: true,
  joining_date: `202${index % 4 + 2}-0${index % 8 + 1}-15`,
  department: { name: departments[index % departments.length] },
}));

const monthKeys = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const transactionRows = monthKeys.flatMap((month, index) => [
  { id: `demo-income-${month}`, transaction_type: 'income', transaction_date: `${month}-08`, amount: 42000 + index * 4800 },
  { id: `demo-payment-${month}`, transaction_type: 'invoice_payment', transaction_date: `${month}-18`, amount: 26500 + index * 3200 },
  { id: `demo-expense-${month}`, transaction_type: 'expense', transaction_date: `${month}-21`, amount: 14500 + index * 1300 },
]);

const leadStatuses = ['New', 'Contacted', 'Qualified', 'Proposal', 'Won'];
const demoLeads = Array.from({ length: 24 }, (_, index) => ({
  id: `demo-lead-${index + 1}`,
  full_name: `Prospect ${['Aster', 'Beacon', 'Cedar', 'Delta'][index % 4]} ${index + 1}`,
  lead_date: `2026-${String(4 + (index % 6)).padStart(2, '0')}-${String(3 + (index % 20)).padStart(2, '0')}`,
  created_at: `2026-${String(4 + (index % 6)).padStart(2, '0')}-05T09:00:00.000Z`,
  converted_at: index % 5 === 0 ? `2026-${String(5 + (index % 5)).padStart(2, '0')}-20T09:00:00.000Z` : null,
  status: { name: leadStatuses[index % leadStatuses.length], sort_order: index % leadStatuses.length },
  temperature: index % 4 === 0 ? 'hot' : 'warm',
}));

const demoInvoices = Array.from({ length: 6 }, (_, index) => ({
  id: `demo-invoice-${index + 1}`,
  status: index === 0 ? 'sent' : index === 1 ? 'overdue' : 'partially_paid',
  tax: 500,
  discount: 0,
  due_date: `2026-09-${String(5 + index).padStart(2, '0')}`,
  finance_invoice_items: [{ quantity: 1, rate: 18000 + index * 2500 }],
  finance_invoice_payments: index > 1 ? [{ amount: 5000 }] : [],
}));

export const demoDirectorDashboardData = {
  timezone: 'Asia/Kolkata',
  finance: { monthly: transactionRows },
  leads: demoLeads,
  sales: demoLeads.filter((lead) => lead.converted_at).map((lead, index) => ({ id: `demo-sale-${index + 1}`, closing_date: lead.converted_at?.slice(0, 10) })),
  invoices: demoInvoices,
  summary: { employees: demoDirectorEmployees.length - 1, presentToday: 7, lateToday: 1, onLeave: 1, pendingLeave: 3, openTasks: 8, overdueTasks: 2, pendingDocuments: 2, unreadNotifications: 4, leads: demoLeads.length, newLeads: 4, followupsDue: 5, hotLeads: 6, sales: 5 },
};

export const demoDirectorModules = {
  clinicians: clinicianNames.map((full_name, index) => ({ id: `demo-clinician-${index + 1}`, full_name, designation: 'Clinician', department: { name: 'Clinical Services' }, email: `clinician-${index + 1}@example.com` })),
  appointments: demoAppointments.map((appointment, index) => ({ ...appointment, date: `2026-09-${String(17 + (index % 8)).padStart(2, '0')}`, clinician: appointment.clinician })),
  attendance: demoDirectorEmployees.map((employee, index) => ({ ...employee, on_leave: employee.status === 'on_leave', attendance: index < 7 ? { status: index === 2 ? 'late' : 'present', clock_in: '2026-09-17T05:00:00.000Z', clock_out: null } : null })),
  leaveRequests: demoDirectorEmployees.slice(1, 6).map((employee, index) => ({ id: `demo-leave-${index + 1}`, status: index < 3 ? 'pending' : 'approved', employee, starts_on: `2026-09-${20 + index}`, ends_on: `2026-09-${21 + index}`, reason: ['Personal appointment', 'Annual leave', 'Family commitment'][index % 3] })),
  tasks: ['Review new intake summaries', 'Confirm next-week appointments', 'Prepare weekly care overview', 'Review pending leave requests', 'Follow up with warm prospects', 'Publish monthly operations report', 'Reconcile open invoices', 'Schedule clinician supervision'].map((title, index) => ({ id: `demo-task-${index + 1}`, title, status: index < 2 ? 'in_progress' : index === 7 ? 'completed' : 'todo', priority: index < 2 ? 'high' : 'medium', due_date: `2026-09-${18 + (index % 7)}`, assignee: demoDirectorEmployees[(index + 1) % demoDirectorEmployees.length] })),
  notifications: ['New intake assigned to Clinical Services', 'Three leave requests need review', 'Monthly report is ready to review', 'Two appointments were rescheduled', 'A new prospect entered the pipeline'].map((title, index) => ({ id: `demo-notification-${index + 1}`, title, body: 'Synthetic notification for the public portfolio demo.', read_at: index > 2 ? '2026-09-17T10:00:00.000Z' : null, created_at: `2026-09-17T0${8 + index}:00:00.000Z`, recipient: demoUser })),
};
