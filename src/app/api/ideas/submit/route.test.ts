import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(resolve(process.cwd(), 'src/app/api/ideas/submit/route.ts'), 'utf8');

describe('Idea submission route', () => {
  it('uses the authenticated server client, validates uploads, and rolls back failures', () => {
    expect(route).toContain("request.formData()");
    expect(route).toContain("validateIdeaAttachment(file)");
    expect(route).toContain("IDEA_ATTACHMENTS_BUCKET");
    expect(route).toContain("cleanup.from('ideas').delete().eq('id', ideaId)");
    expect(route).toContain("'The attachment could not be uploaded. Please try again or submit the idea without the attachment.'");
  });
});
