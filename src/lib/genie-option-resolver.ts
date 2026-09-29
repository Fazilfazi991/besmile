export type GenieOption = { id: string; name: string };

export type GenieOptionAliases = Record<string, readonly string[]>;

export type GenieOptionMatch<T extends GenieOption = GenieOption> = {
  status: 'match';
  option: T;
  confidence: 'exact' | 'normalized' | 'alias' | 'partial' | 'fuzzy';
};

export type GenieOptionResolution<T extends GenieOption = GenieOption> =
  | GenieOptionMatch<T>
  | { status: 'ambiguous'; options: T[] }
  | { status: 'no_match'; options: T[] };

export type GenieOptionResolverInput<T extends GenieOption = GenieOption> = {
  input: string;
  options: readonly T[];
  aliases?: GenieOptionAliases;
  mode?: 'conservative' | 'strict';
};

export function normalizeGenieOptionText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const compact = (value: string) => normalizeGenieOptionText(value).replace(/\s/g, '');

function levenshtein(left: string, right: string) {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

const similarity = (left: string, right: string) => {
  const longest = Math.max(left.length, right.length);
  return longest ? 1 - levenshtein(left, right) / longest : 1;
};

const unique = <T extends GenieOption>(options: readonly T[]) =>
  [...new Map(options.map(option => [option.id, option])).values()];

const valuesFor = <T extends GenieOption>(option: T, aliases: GenieOptionAliases) => [
  { value: option.name, alias: false },
  ...(aliases[option.name] || []).map(value => ({ value, alias: true })),
];

export function resolveGenieOption<T extends GenieOption>({
  input,
  options,
  aliases = {},
  mode = 'conservative',
}: GenieOptionResolverInput<T>): GenieOptionResolution<T> {
  const available = unique(options);
  const normalizedInput = normalizeGenieOptionText(input);
  const compactInput = compact(input);
  if (!normalizedInput || !compactInput || !available.length) return { status: 'no_match', options: available };

  const idMatches = available.filter(option => option.id === input);
  if (idMatches.length === 1) return { status: 'match', option: idMatches[0], confidence: 'exact' };

  const exactCanonical = available.filter(option => normalizeGenieOptionText(option.name) === normalizedInput);
  if (exactCanonical.length === 1) return { status: 'match', option: exactCanonical[0], confidence: 'exact' };
  if (exactCanonical.length > 1) return { status: 'ambiguous', options: exactCanonical };

  const compactCanonical = available.filter(option => compact(option.name) === compactInput);
  if (compactCanonical.length === 1) return { status: 'match', option: compactCanonical[0], confidence: 'normalized' };
  if (compactCanonical.length > 1) return { status: 'ambiguous', options: compactCanonical };

  const exactAliases = available.filter(option =>
    (aliases[option.name] || []).some(alias => compact(alias) === compactInput),
  );
  if (exactAliases.length === 1) return { status: 'match', option: exactAliases[0], confidence: 'alias' };
  if (exactAliases.length > 1) return { status: 'ambiguous', options: exactAliases };

  if (compactInput.length >= 3) {
    const partial = available.filter(option =>
      valuesFor(option, aliases).some(({ value }) => {
        const candidate = compact(value);
        return candidate.includes(compactInput) || compactInput.includes(candidate);
      }),
    );
    if (partial.length === 1) return { status: 'match', option: partial[0], confidence: 'partial' };
    if (partial.length > 1) return { status: 'ambiguous', options: partial };
  }

  if (mode === 'strict' || compactInput.length < 3) return { status: 'no_match', options: available };

  const scores = available
    .map(option => ({
      option,
      score: Math.max(...valuesFor(option, aliases).map(({ value }) => similarity(compactInput, compact(value)))),
    }))
    .sort((left, right) => right.score - left.score || left.option.name.localeCompare(right.option.name));
  const threshold = compactInput.length <= 4 ? 0.72 : compactInput.length <= 8 ? 0.78 : 0.82;
  const qualified = scores.filter(candidate => candidate.score >= threshold);
  if (!qualified.length) return { status: 'no_match', options: available };
  if (qualified.length > 1 && qualified[0].score - qualified[1].score < 0.08) {
    return { status: 'ambiguous', options: qualified.slice(0, 4).map(candidate => candidate.option) };
  }
  return { status: 'match', option: qualified[0].option, confidence: 'fuzzy' };
}
