import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/components/chat-hub-fixes.css'), 'utf8');
const component = readFileSync(resolve(process.cwd(), 'src/components/chat-hub.tsx'), 'utf8');

describe('chat visual density', () => {
  it('keeps the desktop conversation, thread, and details proportions compact', () => {
    expect(styles).toContain('grid-template-columns:312px minmax(0,1fr)');
    expect(styles).toContain('width:320px;min-height:0;overflow-y:auto');
    expect(styles).toContain('min-height:72px');
  });

  it('uses compact circular controls and avatars instead of stretched panels', () => {
    expect(styles).toContain('border-radius:50%');
    expect(styles).toContain('width:40px;height:40px');
    expect(styles).toContain('width:42px;min-width:42px;height:42px');
  });

  it('keeps the composer fixed in the panel with the primary send action visible', () => {
    expect(styles).toContain('grid-template-columns:auto minmax(0,1fr) auto auto auto');
    expect(styles).toContain('min-height:70px');
    expect(styles).toContain('position:fixed;z-index:20');
  });

  it('keeps the approved mention filter available only through real mention state', () => {
    expect(component).toContain('["all", "unread", "mentions"]');
    expect(component).toContain('tab === "mentions" && item.mention_count > 0');
  });

  it('renders real-date grouping and keeps sender labels grouped', () => {
    expect(component).toContain('const dateLabel');
    expect(component).toContain('new Date(previous.created_at).toDateString()');
    expect(component).toContain('chat-message-group ${continuesSenderGroup ? "is-continuation" : "is-new-sender"}');
    expect(component).toContain('> 300000');
    expect(component).toContain('<= 300000');
    expect(styles).toContain('.chat-message-group.is-continuation .chat-message');
  });

  it('keeps the details drawer and shared files available without narrowing the thread', () => {
    expect(styles).toContain('position:absolute;z-index:8;top:0;right:0;bottom:0;width:320px');
    expect(component).toContain('<b>Shared files</b>');
    expect(component).toContain('messages.filter((message) => message.attachment_name && isChatMessageActive(message, logicalNow)).slice(-6)');
  });

  it('bounds the mobile-safe composer input', () => {
    expect(component).toContain('Math.min(element.scrollHeight, 120)');
    expect(styles).toContain('max-height:120px');
    expect(styles).toContain('font-size:16px');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });

  it('keeps normal, recording, and voice-preview composer states in the real message workflow', () => {
    expect(component).toContain('className="chat-composer-main"');
    expect(component).toContain('className="chat-recording" aria-live="polite"');
    expect(component).toContain('toggleRecordingPause');
    expect(component).toContain('cancelRecording');
    expect(component).toContain('className="chat-voice-preview"');
    expect(styles).toContain('.chat-hub .chat-recording,.chat-hub .chat-voice-preview');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });

  it('presents existing voice, files, and reactions as compact Teams media', () => {
    expect(component).toContain('const fileKind =');
    expect(component).toContain('className="chat-voice-message"');
    expect(component).toContain('className="chat-reactions"');
    expect(styles).toContain('.chat-hub .chat-attachment{grid-template-columns:38px');
    expect(styles).toContain('.chat-hub .chat-voice-message{display:flex');
  });

  it('keeps message actions quiet until intentional hover or focus', () => {
    expect(styles).toContain('.chat-message>div:hover .chat-reaction-button');
    expect(styles).toContain('.chat-message>div:hover .chat-message-more');
    expect(styles).toContain('.chat-message-more,.chat-hub .chat-reaction-button{opacity:1}');
  });

  it('uses single-pane mobile and an overlay details drawer without squeezing the thread', () => {
    expect(styles).toContain('@media(max-width:760px)');
    expect(styles).toContain('.chat-hub.chat-open .chat-conversation-panel,.chat-hub:not(.chat-open) .chat-message-panel{display:none}');
    expect(styles).toContain('width:100vw');
    expect(styles).not.toContain('.chat-header-actions button:nth-child(2),.chat-hub .chat-more-button{display:none!important}');
    expect(component).toContain('aria-label="Conversation details"');
    expect(styles).toContain('@media(max-width:1180px){.chat-hub .chat-layout{grid-template-columns:296px minmax(0,1fr)}');
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
