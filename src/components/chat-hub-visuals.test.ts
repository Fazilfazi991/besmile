import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const styles = readFileSync(resolve(process.cwd(), 'src/components/chat-hub-fixes.css'), 'utf8');

describe('chat visual density', () => {
  it('keeps the desktop conversation, thread, and details proportions compact', () => {
    expect(styles).toContain('grid-template-columns:320px minmax(0,1fr)');
    expect(styles).toContain('grid-template-columns:320px minmax(0,1fr) 294px');
    expect(styles).toContain('min-height:72px');
  });

  it('uses compact circular controls and avatars instead of stretched panels', () => {
    expect(styles).toContain('border-radius:50%!important');
    expect(styles).toContain('width:40px;height:40px');
    expect(styles).toContain('width:42px;min-width:42px;height:42px');
  });

  it('keeps the composer fixed in the panel with the primary send action visible', () => {
    expect(styles).toContain('grid-template-columns:auto minmax(0,1fr) auto auto auto');
    expect(styles).toContain('min-height:62px');
    expect(styles).toContain('position:fixed;z-index:20');
  });
});
