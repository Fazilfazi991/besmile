export function insertEmojiAtCursor(
  value: string,
  emoji: string,
  start = value.length,
  end = start,
) {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  return {
    value: `${value.slice(0, safeStart)}${emoji}${value.slice(safeEnd)}`,
    cursor: safeStart + emoji.length,
  };
}

export const chatEmojiGroups = [
  {
    label: "Smileys",
    emojis: ["😀", "😊", "😂", "🥰", "😎", "🤔", "😅", "🎉"],
  },
  {
    label: "Gestures",
    emojis: ["👍", "👏", "🙏", "🙌", "👌", "💪", "👋", "🤝"],
  },
  { label: "Hearts", emojis: ["❤️", "💚", "💙", "💛", "💜", "💖"] },
  {
    label: "Objects & symbols",
    emojis: ["✅", "⭐", "📌", "📅", "💡", "🚀", "⚠️", "✨"],
  },
] as const;
