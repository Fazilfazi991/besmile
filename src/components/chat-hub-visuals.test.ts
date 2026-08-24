import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/components/chat-hub-fixes.css'), 'utf8');
const component = readFileSync(resolve(process.cwd(), 'src/components/chat-hub.tsx'), 'utf8');

describe('chat visual density', () => {
  it('keeps the desktop conversation, thread, and details proportions compact', () => {
    expect(styles).toContain('grid-template-columns: 312px minmax(0, 1fr)');
    expect(styles).toContain('width: 304px; min-height: 0; overflow-y: auto');
    expect(styles).toContain('min-height: 64px');
  });

  it('uses compact circular controls and avatars instead of stretched panels', () => {
    expect(styles).toContain('border-radius: 50% !important');
    expect(styles).toContain('width: 40px; height: 40px');
    expect(styles).toContain('width: 40px; min-width: 40px; height: 40px');
  });

  it('keeps the composer fixed in the panel with the primary send action visible', () => {
    expect(styles).toContain('grid-template-columns: 40px minmax(0,1fr) 32px 32px 40px');
    expect(styles).toContain('min-height: 60px');
    expect(styles).toContain('position: fixed; z-index: 20');
    expect(component).toContain('className="chat-composer-inner"');
  });

  it('keeps the approved mention filter available only through real mention state', () => {
    expect(component).toContain('["all", "unread", "mentions"]');
    expect(component).toContain('tab === "mentions" && item.mention_count > 0');
  });

  it('renders real-date grouping and keeps sender labels grouped', () => {
    expect(component).toContain('const dateLabel');
    expect(component).toContain('new Date(previous.created_at).toDateString()');
    expect(component).toContain('className="chat-message-group"');
    expect(component).toContain('> 300000');
    expect(component).toContain('sender ? "group-start"');
    expect(component).toContain('<Avatar name={message.sender?.full_name || "Member"} />');
    expect(component).toContain('className="chat-message-media"');
    expect(component).toContain('className="chat-message-bubble"');
    expect(styles).toContain('background: transparent !important');
    expect(styles).toContain('chat-message-media { display: flex; align-items: flex-start; gap: 16px; }');
    expect(styles).toContain('chat-message>.chat-message-media { border: 0; border-radius: 0; background: transparent; padding: 0; box-shadow: none; }');
  });

  it('keeps message actions as hover/menu icon controls instead of permanent action text', () => {
    expect(component).toContain('className={`chat-message-actions');
    expect(component).toContain('className="chat-message-menu-trigger"');
    expect(component).toContain('onContextMenu={(event) =>');
    expect(component).toContain('<span>Reply</span>');
    expect(component).toContain('<MessageActionIcon kind="delete" />');
    expect(styles).toContain('top: 6px; right: 6px;');
    expect(styles).toContain('chat-message-bubble:hover .chat-message-menu-trigger');
    expect(styles).toContain('position: fixed; z-index: 100;');
    expect(component).toContain('className="chat-action-quick-reactions"');
    expect(component).toContain('Message privately');
    expect(component).toContain('message.attachment_path &&');
    expect(styles).toContain('width: min(180px,calc(100vw - 16px));');
    expect(styles).toContain('chat-message-actions .chat-action-quick-reactions { position: absolute;');
    expect(component).toContain('headerBottom + reactionStripHeight + 8');
    expect(component).toContain('actionOpen ? "action-open" : ""');
    expect(component).toContain('tabIndex={!message.deleted_at');
    expect(styles).toContain('pointer-events: none');
    expect(styles).toContain('chat-message.action-open .chat-message-menu-trigger');
  });

  it('keeps the details drawer and shared files available without narrowing the thread', () => {
    expect(styles).toContain('position: absolute; z-index: 8; top: 0; right: 0; bottom: 0; width: 304px');
    expect(component).toContain('<b>Shared files</b>');
    expect(component).toContain('messages.filter((message) => message.attachment_name && !message.expired_at && !message.deleted_at).slice(-6)');
  });

  it('bounds the mobile-safe composer input', () => {
    expect(component).toContain('Math.min(element.scrollHeight, 120)');
    expect(styles).toContain('max-height: 120px');
    expect(styles).toContain('font-size: 16px');
    expect(styles).toContain('max-width: 100%');
  });

  it('renders persisted reply, edit, and soft-delete states in the existing thread UI', () => {
    expect(component).toContain('reply_to_message_id');
    expect(component).toContain('Replying to ${replyingTo?.sender?.full_name');
    expect(component).toContain('Editing message');
    expect(component).toContain('This message was deleted');
    expect(component).toContain('message.edited_at');
    expect(component).toContain('event: "UPDATE"');
  });

  it('enables persisted participant-only mentions without changing the chat layout', () => {
    expect(component).toContain('tab === "mentions" && item.mention_count > 0');
    expect(component).toContain('chat-mention-picker');
    expect(component).toContain('Mention a participant');
    expect(component).toContain('mention_profile_ids: mentionProfileIds');
    expect(component).toContain('renderMentionText(message)');
  });
});
