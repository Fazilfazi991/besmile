import { ClinicianClientDetail } from '@/components/clinician-client-detail';
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ClinicianClientDetail slug={slug} />;
}
