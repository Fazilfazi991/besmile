import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const route = readFileSync('src/app/api/genie/route.ts', 'utf8');

describe('Genie active-slot routing', () => {
  it('resolves the active workflow field before policy fallback', () => {
    expect(route.indexOf('resolveWorkflowFieldInput(action, focused, input, choices)')).toBeGreaterThan(-1);
    expect(route.indexOf('resolveWorkflowFieldInput(action, focused, input, choices)')).toBeLessThan(route.indexOf('answerPolicyQuestion(question)'));
  });

  it('keeps ambiguous or unsafe values in the current slot without updating the draft', () => {
    expect(route).toContain("if (resolution && resolution.status !== 'match')");
    expect(route.indexOf("if (resolution && resolution.status !== 'match')")).toBeLessThan(route.indexOf("db.rpc('update_genie_workflow_draft'"));
  });
});
