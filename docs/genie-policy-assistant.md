# Genie policy assistant

Genie is an internal, retrieval-only FAQ assistant for the three approved BSmile policy documents in `knowledge/genie/policies`.

## Architecture

1. `manifest.json` records each document title, version, effective or updated date, and source PDF filename.
2. `scripts/ingest-genie-policies.py` verifies each source file, records its SHA-256 hash and page count, and extracts section-level chunks with page metadata.
3. The deterministic output is committed at `src/data/genie-policy-index.json`. Production does not parse PDFs or require Python.
4. `src/lib/genie-policy.ts` performs local lexical retrieval with policy-domain synonyms, document intent, source thresholds, and an exact-excerpt answer formatter.
5. `POST /api/genie` accepts only a short policy question. It authenticates the session, checks the minimal `status,is_employee` profile projection, and returns a grounded answer with document, version, section, page, and excerpt metadata.

No LLM, external search, vector service, client record, CRM record, Finance record, or private employee profile field is used. Questions and answers are not persisted.

## Updating an approved policy

1. Replace the PDF in `knowledge/genie/policies`.
2. Update its metadata or add the new version in `manifest.json`.
3. Run `pnpm genie:ingest` (install `pypdf` first if needed).
4. Review the generated index diff, especially section titles, page ranges, effective dates, and SHA-256 hashes.
5. Run `pnpm exec vitest run src/lib/genie-policy.test.ts`, then the normal lint, typecheck, build, and browser checks.

The generated index is deterministic and source-controlled so a policy update is reviewable and does not depend on runtime ingestion.

## Authorization model

- Both `/employee/genie` and `/admin/genie` remain inside their authenticated workspace layouts.
- The API independently requires a valid user session and an active internal profile.
- Profiles explicitly marked `is_employee = false`, plus inactive or terminated profiles, are denied.
- Responses are returned with `Cache-Control: private, no-store`.

## Grounding behavior

- Answers reproduce selected policy wording as an exact excerpt instead of silently rewriting it.
- Every supported answer includes document, version, section, page, and expandable source text.
- When support is insufficient, Genie returns: “I couldn’t find that in the approved policies.”
- When the approved documents contain distinct relevant wording, such as intern reporting, Genie shows both statements instead of hiding the ambiguity.
