import { describe, expect, it } from 'vitest';
import { answerPolicyQuestion, geniePolicyDocuments } from './genie-policy';

describe('Genie approved-policy retrieval', () => {
  it.each([
    ['What are BSmile working hours?', '9:00 AM to 6:00 PM', 'Employee Handbook', '4.2 Working Hours'],
    ['How many casual leaves do employees receive?', '1 casual leave per month', 'Employee Handbook', '5.1 Leave Approval'],
    ['What is the leave approval process?', 'submitted through email', 'Employee Handbook', '5.1 Leave Approval'],
    ['What is the moonlighting policy?', 'strictly prohibited', 'Employee Handbook', '3.2 Moonlighting Policy'],
    ['What are the standard timings for interns?', '10AM-4PM', 'Internship Policy', '9 CLINIC TIMINGS AND ATTENDANCE'],
    ['How many interview rounds are there?', 'two-stage interview process', 'Hiring & Recruitment Policy', '9 INTERVIEW AND SELECTION PROCESS'],
    ['What documents are required before joining?', 'Identity proof', 'Hiring & Recruitment Policy', '14 DOCUMENT SUBMISSION'],
    ['What happens if an intern has repeated absences?', 'Repeated absence', 'Internship Policy', '10 LEAVE AND ABSENCE'],
    ['How is intern performance assessed?', 'objective professional and work-related criteria', 'Internship Policy', '15 PERFORMANCE ASSESSMENT'],
  ])('answers %s with exact supported wording and citation metadata', (question, wording, document, section) => {
    const result = answerPolicyQuestion(question);
    expect(result.status).toBe('answered');
    expect(result.answer).toContain(wording);
    expect(result.sources[0]).toMatchObject({ documentTitle: document, section });
    expect(result.sources[0].pages.length).toBeGreaterThan(0);
  });

  it('returns the recruitment process summary from the hiring policy', () => {
    const result = answerPolicyQuestion('What is the recruitment process?');
    expect(result.status).toBe('answered');
    expect(result.sources[0]).toMatchObject({
      documentTitle: 'Hiring & Recruitment Policy',
      section: '27 RECRUITMENT PROCESS SUMMARY',
    });
  });

  it('declines questions that the three approved documents do not cover', () => {
    const result = answerPolicyQuestion('Where can I park my car?');
    expect(result).toEqual({
      status: 'not_found',
      answer: 'I couldn’t find that in the approved policies. Try asking about the Employee Handbook, Hiring & Recruitment Policy, or Internship Policy.',
      sources: [],
    });
  });

  it('answers acknowledgements before retrieval without changing unsupported-question behavior', () => {
    expect(answerPolicyQuestion('okay')).toEqual({
      status: 'conversation',
      answer: 'Got it. Ask me anything else about the approved BSmile policies.',
      sources: [],
    });
    expect(answerPolicyQuestion('good morning')).toEqual({
      status: 'conversation',
      answer: 'Good morning! How can I help?',
      sources: [],
    });
    expect(answerPolicyQuestion('Okay, where can I park my car?').status).toBe('not_found');
    const mixedPolicy = answerPolicyQuestion('Hi, what is the leave policy?');
    expect(mixedPolicy.status).toBe('answered');
    expect(mixedPolicy.sources.length).toBeGreaterThan(0);
    expect(answerPolicyQuestion('Hi, add a lead').status).not.toBe('conversation');
  });

  it.each([
    'Hi',
    'Hello',
    'Good morning',
    'Good afternoon',
    'Good evening',
    'Thanks',
    'Thank you',
    'OK',
    'Understood',
  ])('answers pure small talk %s without policy sources', (message) => {
    const result = answerPolicyQuestion(message);
    expect(result.status).toBe('conversation');
    expect(result.sources).toEqual([]);
  });

  it('surfaces both approved statements when intern reporting wording is ambiguous', () => {
    const result = answerPolicyQuestion('Who does an intern report to?');
    expect(result.status).toBe('answered');
    expect(result.sources.map((source) => source.documentTitle)).toEqual([
      'Employee Handbook',
      'Internship Policy',
    ]);
    expect(result.answer).toContain('Interns → Assistant Manager');
    expect(result.answer).toContain('Internship Supervisor or designated reporting authority');
  });

  it('publishes replaceable document metadata for all approved versions', () => {
    expect(geniePolicyDocuments()).toEqual([
      expect.objectContaining({ title: 'Employee Handbook', version: '1.0', updatedDate: '2026-08-11', pageCount: 7 }),
      expect.objectContaining({ title: 'Hiring & Recruitment Policy', version: '1.0', updatedDate: '2026-08-12', pageCount: 16 }),
      expect.objectContaining({ title: 'Internship Policy', version: '1.0', effectiveDate: '2026-08-01', pageCount: 13 }),
    ]);
  });
});
