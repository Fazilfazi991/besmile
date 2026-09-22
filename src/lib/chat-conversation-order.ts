export function conversationActivityAt(item: any) {
  const conversation = item.chat_conversations || item;
  return item.latest_message?.created_at || conversation.updated_at || conversation.created_at || "";
}

export function compareConversationActivity(a: any, b: any) {
  const activityDifference = new Date(conversationActivityAt(b)).getTime() - new Date(conversationActivityAt(a)).getTime();
  if (activityDifference) return activityDifference;
  return String(a.conversation_id || a.id || "").localeCompare(String(b.conversation_id || b.id || ""));
}

export function orderConversationsByActivity<T>(items: T[]) {
  return [...items].sort(compareConversationActivity);
}

export function applyLatestConversationMessage<T extends any>(items: T[], message: any, viewerId?: string) {
  return orderConversationsByActivity(items.map((item: any) => {
    if (item.conversation_id !== message.conversation_id) return item;
    const alreadyLatest = item.latest_message?.id === message.id;
    const currentTime = new Date(item.latest_message?.created_at || 0).getTime();
    const incomingTime = new Date(message.created_at || 0).getTime();
    if (incomingTime < currentTime || (incomingTime === currentTime && String(message.id) < String(item.latest_message?.id || "")))
      return item;
    return {
      ...item,
      latest_message: { ...message },
      unread_count: message.sender_id !== viewerId && !alreadyLatest
        ? Number(item.unread_count || 0) + 1
        : item.unread_count,
    };
  })) as T[];
}

export function applyGroupPhoto<T extends any>(items: T[], conversationId: string, avatarPath: string | null, photoUrl: string | null) {
  return items.map((item: any) => item.conversation_id === conversationId
    ? {
        ...item,
        chat_conversations: {
          ...item.chat_conversations,
          avatar_path: avatarPath,
          photo_url: photoUrl,
        },
      }
    : item) as T[];
}
