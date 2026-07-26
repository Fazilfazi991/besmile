'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { adminRepository } from '@/lib/admin-repository';
import { EmployeeBanner, EmployeeLoading, EmployeeMetric, EmployeeMetricGrid, EmployeePageHeader, EmployeeSection } from '@/components/employee-ui';

export default function SuperAdminDashboard() {
  const [summary, setSummary] = useState<any>();
  const [error, setError] = useState('');
  useEffect(() => { const load = async () => { try { setSummary(await adminRepository.superAdminDashboard()); } catch (caught: any) { setError(caught.message || 'Unable to load the Super Admin dashboard.'); } }; void load(); }, []);
  if (error) return <section><EmployeePageHeader title="Super Admin Dashboard" subtitle="Live platform overview and control links." /><EmployeeBanner>{error}</EmployeeBanner></section>;
  if (!summary) return <section><EmployeePageHeader title="Super Admin Dashboard" subtitle="Live platform overview and control links." /><EmployeeLoading cards={5} /></section>;
  return <section className="space-y-4">
    <EmployeePageHeader title="Super Admin Dashboard" subtitle="Live overview of people, work, and CRM." />
    <EmployeeMetricGrid columns={6}><EmployeeMetric label="Employees" value={summary.employees} /><EmployeeMetric label="Present today" value={summary.presentToday} tone="success" /><EmployeeMetric label="On leave" value={summary.onLeave} tone="info" /><EmployeeMetric label="Pending leave" value={summary.pendingLeave} tone="pending" /><EmployeeMetric label="Open tasks" value={summary.openTasks} /><EmployeeMetric label="Overdue tasks" value={summary.overdueTasks} tone="danger" /></EmployeeMetricGrid>
    <EmployeeMetricGrid columns={6}><EmployeeMetric label="Pending documents" value={summary.pendingDocuments} tone="pending" /><EmployeeMetric label="Unread updates" value={summary.unreadNotifications} /><EmployeeMetric label="Total leads" value={summary.leads} /><EmployeeMetric label="Follow-ups due" value={summary.followupsDue} tone="pending" /><EmployeeMetric label="Hot leads" value={summary.hotLeads} tone="danger" /><EmployeeMetric label="Sales" value={summary.sales} tone="success" /></EmployeeMetricGrid>
    <EmployeeSection title="Quick actions" description="Open the management areas available to your current permissions."><div className="flex flex-wrap gap-2 p-4">{[['Employees','/admin/employees'],['Tasks','/admin/tasks'],['Documents','/admin/documents'],['Announcements','/admin/announcements'],['CRM','/admin/crm'],['Roles & Access','/admin/access']].map(([label, href]) => <Link className="btn border" href={href} key={href}>{label}</Link>)}</div></EmployeeSection>
    <EmployeeSection title="Finance" description="Income, expenses, payroll, invoices, and balances will appear here when their live finance tables are configured."><p className="p-4 text-sm text-slate-600">No finance data has been added to the current Supabase schema, so this dashboard deliberately does not show mock values.</p></EmployeeSection>
  </section>;
}
