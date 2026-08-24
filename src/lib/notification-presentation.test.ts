import { describe, expect, it } from 'vitest';
import { presentationForNotification } from '@/lib/notification-presentation';

describe('notification presentation mapping', () => {
  it('uses canonical category before type and route fallbacks', () => {
    expect(presentationForNotification({ category: 'chat', type: 'task_assigned' }).category).toBe('inbox');
  });

  it.each([
    ['chat_message', 'inbox'], ['new_announcement', 'announcement'], ['task_assigned', 'task'],
    ['document_approved', 'document'], ['leave_submitted', 'leave'], ['meeting_completed', 'meeting'],
  ])('maps %s to %s', (type, category) => {
    expect(presentationForNotification({ type }).category).toBe(category);
  });

  it('keeps unmapped real notifications in the explicit system category', () => {
    expect(presentationForNotification({ type: 'profile_updated' }).category).toBe('system');
  });
});
