import { IdeaDetailPage } from '@/components/idea-hub';
export default async function Page({params}:{params:Promise<{ideaId:string}>}){const {ideaId}=await params;return <IdeaDetailPage id={ideaId} mode="employee"/>;}
