'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { currentProfile } from '@/lib/auth';
import { employeeRepository } from '@/lib/employee-repository';
import { EmployeeBanner, EmployeeLoading, EmployeePageHeader, EmployeeSection, EmployeeStatusBadge } from '@/components/employee-ui';

const fmtDate = (value?: string | null) => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Not set';
const titleCase = (value?: string | null) => String(value || 'general').split(/[_\s-]+/).filter(Boolean).map(part => part.slice(0, 1).toUpperCase() + part.slice(1)).join(' ');

export function AnnouncementDetail({ id }: { id: string }) {
  const [profile, setProfile] = useState<any>();
  const [item, setItem] = useState<any>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const current = await currentProfile() as any;
        if (!current) throw new Error('Your session has expired.');
        const announcement = await employeeRepository.announcement(id, current.id);
        setProfile(current);
        setItem({ ...announcement, is_read: true });
        if (!announcement.is_read) await employeeRepository.markAnnouncementRead(announcement.id, current.id);
        setError('');
      } catch (caught: any) {
        setError(caught.message || 'Announcement unavailable.');
      } finally {
        setLoading(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [id]);

  if (loading) return <section><EmployeePageHeader title="Announcement" subtitle="Loading company update." /><EmployeeLoading /></section>;
  if (error || !profile || !item) return <section><EmployeePageHeader title="Announcement" subtitle="Company update" action={<Link className="btn border" href="/employee/announcements">Back</Link>} /><EmployeeBanner>{error || 'Announcement unavailable.'}</EmployeeBanner></section>;

  return <section className="space-y-4">
    <EmployeePageHeader title={item.title} subtitle={`${titleCase(item.category)} - ${fmtDate(item.published_at)}`} action={<Link className="btn border" href="/employee/announcements">Back</Link>} />
    <EmployeeSection title="Announcement" description={item.author?.full_name || 'BSmile'} action={item.is_pinned ? <EmployeeStatusBadge tone="pending">Pinned</EmployeeStatusBadge> : undefined}>
      <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-slate-700">{item.body}</p>
    </EmployeeSection>
  </section>;
}
