export type CrmLeadSourceLookup = { id: string; name: string };

const normalizedSourceName = (value: unknown) => String(value ?? '').trim().toLocaleLowerCase('en');

export function resolveCrmLeadSource(
  sources: CrmLeadSourceLookup[],
  requestedName: unknown,
  fallbackName = 'Other',
) {
  const requested = normalizedSourceName(requestedName);
  const fallback = normalizedSourceName(fallbackName);
  return sources.find(source => normalizedSourceName(source.name) === requested)
    ?? sources.find(source => normalizedSourceName(source.name) === fallback);
}
