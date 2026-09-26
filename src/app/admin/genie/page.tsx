import { GenieChat } from '@/components/genie-chat';
import { geniePolicyDocuments } from '@/lib/genie-policy';

export default function AdminGeniePage() {
  return <GenieChat documents={geniePolicyDocuments()} />;
}
