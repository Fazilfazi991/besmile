import policyIndex from '@/data/genie-policy-index.json';
import { genieAcknowledgementReply, withoutLeadingGenieGreeting } from './genie-conversation';

type PolicyDocument = {
  id: string;
  title: string;
  version: string;
  sourceFile: string;
  sha256: string;
  pageCount: number;
  updatedDate?: string;
  effectiveDate?: string;
};

type PolicyChunk = {
  id: string;
  documentId: string;
  sectionNumber: string;
  sectionTitle: string;
  pages: number[];
  text: string;
};

export type GenieSource = {
  documentTitle: string;
  version: string;
  section: string;
  pages: number[];
  excerpt: string;
};

export type GenieAnswer = {
  status: 'answered' | 'conversation' | 'not_found';
  answer: string;
  sources: GenieSource[];
};

export type GeniePolicyDocument = Pick<
  PolicyDocument,
  'id' | 'title' | 'version' | 'updatedDate' | 'effectiveDate' | 'pageCount'
>;

const documents = policyIndex.documents as PolicyDocument[];
const chunks = policyIndex.chunks as PolicyChunk[];
const documentsById = new Map(documents.map((document) => [document.id, document]));

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'before', 'by', 'can', 'do',
  'does', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it', 'many', 'my', 'of',
  'on', 'or', 'our', 'please', 'the', 'their', 'there', 'this', 'to', 'what', 'when',
  'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your',
]);

const SYNONYM_GROUPS = [
  ['hour', 'timing', 'schedule', 'shift'],
  ['leave', 'absence', 'absent'],
  ['hire', 'hiring', 'recruit', 'recruitment', 'candidate', 'selection'],
  ['join', 'joining', 'onboard', 'onboarding', 'appointment', 'commencement'],
  ['interview', 'round', 'stage'],
  ['report', 'reporting', 'supervisor', 'authority', 'hierarchy'],
  ['confidential', 'confidentiality', 'privacy', 'disclosure'],
  ['moonlight', 'moonlighting', 'freelance', 'secondary'],
  ['performance', 'assessment', 'evaluate', 'evaluation', 'review'],
  ['document', 'documentation', 'certificate', 'credential'],
  ['intern', 'internship', 'trainee'],
  ['discipline', 'disciplinary', 'termination', 'discontinue', 'discontinuation'],
] as const;

const normalizeToken = (token: string) => {
  let normalized = token.toLowerCase();
  if (normalized.length > 4 && normalized.endsWith('ies')) normalized = `${normalized.slice(0, -3)}y`;
  else if (normalized.length > 3 && normalized.endsWith('s')) normalized = normalized.slice(0, -1);
  if (normalized.length > 5 && normalized.endsWith('ing')) normalized = normalized.slice(0, -3);
  else if (normalized.length > 4 && normalized.endsWith('ed')) normalized = normalized.slice(0, -2);
  return normalized;
};

const tokenize = (value: string) =>
  [...new Set(
    (value.toLowerCase().match(/[a-z0-9]+/g) || [])
      .map(normalizeToken)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  )];

const expandedTerms = (question: string) => {
  const base = tokenize(question);
  const expanded = new Set(base);
  for (const group of SYNONYM_GROUPS) {
    const normalized = group.map(normalizeToken);
    if (normalized.some((term) => expanded.has(term))) normalized.forEach((term) => expanded.add(term));
  }
  return { base, expanded: [...expanded] };
};

const termHits = (value: string, terms: readonly string[]) => {
  const haystack = new Set(tokenize(value));
  return terms.filter((term) => haystack.has(term)).length;
};

const documentIntentBoost = (question: string, documentId: string) => {
  const normalized = question.toLowerCase();
  if (/\bintern(?:ship|s)?\b|\btrainee\b/.test(normalized))
    return documentId === 'internship-policy-v1' ? 14 : -2;
  if (/\bhir(?:e|ing)\b|\brecruit|\bcandidate\b|\binterview\b|\bjoining\b|\bonboarding\b/.test(normalized))
    return documentId === 'hiring-recruitment-policy-v1' ? 12 : -1;
  if (/\bemployee|\bstaff\b|\bmoonlight|\bcasual leave\b/.test(normalized))
    return documentId === 'employee-handbook-v1' ? 10 : -1;
  return documentId === 'employee-handbook-v1' ? 1.5 : 0;
};

const queryShapeBoost = (question: string, chunk: PolicyChunk) => {
  const normalized = question.toLowerCase();
  if (/\bcasual\s+leaves?\b/.test(normalized) && chunk.documentId === 'employee-handbook-v1' && chunk.sectionNumber === '5.1') return 18;
  if (/\bhow many\b.*\b(?:interview|round)|\binterview\b.*\bhow many\b/.test(normalized)
    && chunk.documentId === 'hiring-recruitment-policy-v1' && chunk.sectionNumber === '9') return 18;
  if (/\brecruitment process\b/.test(normalized)
    && chunk.documentId === 'hiring-recruitment-policy-v1' && chunk.sectionNumber === '27') return 18;
  if (/\bdocuments?\b.*\b(?:join|joining|appointment)\b/.test(normalized)
    && chunk.documentId === 'hiring-recruitment-policy-v1' && chunk.sectionNumber === '14') return 12;
  return 0;
};

type RankedChunk = PolicyChunk & {
  document: PolicyDocument;
  score: number;
  baseCoverage: number;
  titleHits: number;
};

const rankChunks = (question: string): RankedChunk[] => {
  const { base, expanded } = expandedTerms(question);
  if (!base.length) return [];
  return chunks
    .map((chunk) => {
      const document = documentsById.get(chunk.documentId)!;
      const titleHits = termHits(chunk.sectionTitle, expanded);
      const documentHits = termHits(document.title, expanded);
      const textHits = termHits(chunk.text, expanded);
      const baseHits = termHits(`${chunk.sectionTitle} ${chunk.text}`, base);
      const baseTextHits = termHits(chunk.text, base);
      const baseCoverage = baseHits / base.length;
      const phrase = base.join(' ');
      const exactPhrase = phrase.length > 5
        && `${chunk.sectionTitle} ${chunk.text}`.toLowerCase().includes(phrase)
        ? 12
        : 0;
      const score = titleHits * 5 + documentHits * 2 + textHits * 2.2 + baseTextHits * 4
        + baseCoverage * 10 + exactPhrase + documentIntentBoost(question, chunk.documentId)
        + queryShapeBoost(question, chunk);
      return { ...chunk, document, score, baseCoverage, titleHits };
    })
    .filter((chunk) => chunk.score > 0)
    .sort((left, right) => right.score - left.score);
};

const excerptFor = (chunk: RankedChunk, question: string) => {
  const { expanded } = expandedTerms(question);
  const subjectTerms = new Set([
    'intern', 'internship', 'trainee', 'employee', 'staff',
    'hire', 'hiring', 'recruit', 'recruitment', 'candidate', 'selection',
  ].map(normalizeToken));
  const focusedTerms = expanded.filter((term) => !subjectTerms.has(term));
  const selectionTerms = focusedTerms.length ? focusedTerms : expanded;
  const lines = chunk.text.split('\n').map((line) => line.trim()).filter(Boolean);
  if (chunk.documentId === 'employee-handbook-v1' && chunk.sectionNumber === '5.1'
    && /\bleave\b.*\bapproval|\bapproval\b.*\bleave|\bleave process\b/i.test(question))
    return lines.slice(0, 4).join('\n');
  if (internReportingNeedsBothPolicies(question)) {
    if (chunk.documentId === 'employee-handbook-v1')
      return lines.find((line) => line.startsWith('Interns →')) || lines[0];
    if (chunk.documentId === 'internship-policy-v1')
      return lines.filter((line) => line.startsWith('Each intern will be assigned') || line.includes('Report to the assigned supervisor')).join('\n');
  }
  const lineScores = lines.map((line, index) => ({
    index,
    score: termHits(line, selectionTerms) * 3 + (line.startsWith('•') ? 0 : 0.5),
  }));
  const matched = lineScores.filter((line) => line.score > 0.5).sort((a, b) => b.score - a.score);
  const selected = new Set<number>();

  for (const match of matched.slice(0, 2)) {
    selected.add(match.index);
    if (lines[match.index].endsWith(':')) {
      for (let offset = 1; offset <= 4 && match.index + offset < lines.length; offset += 1)
        selected.add(match.index + offset);
    }
  }
  if (selected.size === 0) {
    for (let index = 0; index < Math.min(lines.length, 6); index += 1) selected.add(index);
  }

  let excerpt = [...selected]
    .sort((left, right) => left - right)
    .map((index) => lines[index])
    .join('\n');
  if (excerpt.length > 950) excerpt = `${excerpt.slice(0, 947).trimEnd()}…`;
  return excerpt;
};

const sourceFor = (chunk: RankedChunk, question: string): GenieSource => ({
  documentTitle: chunk.document.title,
  version: chunk.document.version,
  section: `${chunk.sectionNumber} ${chunk.sectionTitle}`,
  pages: chunk.pages,
  excerpt: excerptFor(chunk, question),
});

function internReportingNeedsBothPolicies(question: string) {
  return /\bintern(?:ship|s)?\b/i.test(question) && /\breport|\bsupervisor|\bhierarchy/i.test(question);
}

export function answerPolicyQuestion(rawQuestion: string): GenieAnswer {
  const message = rawQuestion.trim().slice(0, 400);
  const acknowledgement = genieAcknowledgementReply(message);
  if (acknowledgement)
    return { status: 'conversation', answer: acknowledgement, sources: [] };
  const question = withoutLeadingGenieGreeting(message);
  const ranked = rankChunks(question);
  const top = ranked[0];
  if (!top || top.score < 12 || top.baseCoverage < 0.34) {
    return {
      status: 'not_found',
      answer: "I couldn’t find that in the approved policies. Try asking about the Employee Handbook, Hiring & Recruitment Policy, or Internship Policy.",
      sources: [],
    };
  }

  let selected = [top];
  if (internReportingNeedsBothPolicies(question)) {
    const internship = ranked.find((chunk) => chunk.documentId === 'internship-policy-v1' && chunk.sectionNumber === '7');
    const handbook = ranked.find((chunk) => chunk.documentId === 'employee-handbook-v1' && chunk.sectionNumber === '6.1');
    if (internship && handbook) selected = [handbook, internship];
  }

  const sources = selected.map((chunk) => sourceFor(chunk, question));
  const answer = sources.length > 1
    ? `The approved policies contain two relevant statements:\n\n${sources.map((source) => `${source.documentTitle}:\n${source.excerpt}`).join('\n\n')}`
    : `According to the ${sources[0].documentTitle}:\n\n${sources[0].excerpt}`;
  return { status: 'answered', answer, sources };
}

export function geniePolicyDocuments(): GeniePolicyDocument[] {
  return documents.map(({ id, title, version, updatedDate, effectiveDate, pageCount }) => ({
    id, title, version, updatedDate, effectiveDate, pageCount,
  }));
}
