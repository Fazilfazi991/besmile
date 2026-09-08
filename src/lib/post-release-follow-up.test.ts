import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const permissions = readFileSync('src/lib/permission-access.ts', 'utf8');
const chat = readFileSync('src/components/chat-hub.tsx', 'utf8');

describe('post-release client follow-up presentation', () => {
  it('exposes the existing Daily Work routes in canonical navigation', () => {
    expect(permissions).toContain('label: "Daily Work Updates"');
    expect(permissions).toContain('href: "/admin/daily-work"');
    expect(permissions).toContain('label: "Daily Work Update"');
    expect(permissions).toContain('href: "/employee/daily-work"');
  });

  it('makes safe group removal discoverable without changing its archive backend', () => {
    expect(chat).toContain('aria-label="More conversation options"');
    expect(chat).toContain('>Delete group</button>');
    expect(chat).toContain('history remains protected for audit purposes');
    expect(chat).toContain('employeeRepository.archiveGroupChat(active.conversation_id)');
    expect(chat).toContain('!active.chat_conversations.is_system_group');
  });
});
