import { AnnouncementDetail } from '@/components/announcement-detail';

export default async function AnnouncementDetailPage({ params }: { params: Promise<{ announcementId: string }> }) {
  const { announcementId } = await params;
  return <AnnouncementDetail id={announcementId} />;
}
