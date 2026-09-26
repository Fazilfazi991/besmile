import { GenieChat } from '@/components/genie-chat';
import { geniePolicyDocuments } from '@/lib/genie-policy';

export default function EmployeeGeniePage() {
  return <GenieChat documents={geniePolicyDocuments()} />;
}
