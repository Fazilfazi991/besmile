export type ChatMessage = { id:string; client_message_id?:string; created_at?:string; [key:string]:unknown };

type ChatMessageAvailability = {
  deleted_at?: string | null;
  expires_at?: string | null;
  expired_at?: string | null;
};

// expires_at is the visibility cutoff. expired_at only records that the
// cleanup worker has normalized the already-expired message.
export function isChatMessageLogicallyExpired(message: ChatMessageAvailability, now = Date.now()) {
  return Boolean(message.expired_at || (message.expires_at && new Date(message.expires_at).getTime() <= now));
}

export function isChatMessageActive(message: ChatMessageAvailability, now = Date.now()) {
  return !message.deleted_at && !isChatMessageLogicallyExpired(message, now);
}

export function upsertChatMessage(current:ChatMessage[], incoming:ChatMessage){
  const byId=current.findIndex(message=>message.id===incoming.id);
  const byClient=incoming.client_message_id?current.findIndex(message=>message.client_message_id===incoming.client_message_id):-1;
  const index=byId>=0?byId:byClient;
  const next=index>=0?current.map((message,position)=>position===index?{...message,...incoming,status:'sent'}:message):[...current,{...incoming,status:incoming.status||'sent'}];
  return next.slice().sort((a,b)=>`${a.created_at||''}:${a.id}`.localeCompare(`${b.created_at||''}:${b.id}`));
}

export function mergeChatMessages(current:ChatMessage[], incoming:ChatMessage[]){return incoming.reduce((items,message)=>upsertChatMessage(items,message),current)}

export function messagesForConversation(messages:ChatMessage[], conversationId:string){return messages.filter(message=>(message as any).conversation_id===conversationId)}
