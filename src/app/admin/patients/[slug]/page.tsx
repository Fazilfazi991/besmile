import { notFound } from 'next/navigation';
import { isDemoMode } from '@/lib/demo-mode';
import { demoPatients } from '@/demo/demo-data';
import { DemoPatientDetail } from '@/demo/demo-workspace';

export default async function AdminPatientDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  if (!isDemoMode()) notFound();
  const { slug } = await params;
  return <DemoPatientDetail patient={demoPatients.find((item) => item.slug === slug) || demoPatients[0]} />;
}
