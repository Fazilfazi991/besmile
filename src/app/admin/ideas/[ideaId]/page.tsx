import { IdeaDetailPage } from '@/components/idea-hub';

export default async function AdminIdeaDetailPage({ params }: { params: Promise<{ ideaId: string }> }) {
  const { ideaId } = await params;
  return <IdeaDetailPage id={ideaId} mode="admin" />;
}
