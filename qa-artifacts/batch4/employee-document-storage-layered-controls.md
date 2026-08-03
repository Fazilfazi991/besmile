# Employee document storage layered controls

Date: 2026-08-03

Decision: employee-document storage is passed with one accepted low-risk platform limitation.

## Accepted low-risk platform limitation

Direct raw Supabase Storage uploads can create a zero-byte object when the caller uses an approved final extension, an approved declared MIME type, the correct authenticated owner, and an authorized path namespace. Supabase bucket settings enforce a maximum object size but do not provide a minimum object size control, and this deployment cannot safely depend on `metadata->>'size'` during Storage INSERT RLS evaluation without blocking valid uploads.

No custom trigger is added to `storage.objects`; the managed Supabase `storage` schema is treated as read-only.

## Bucket configuration

The `employee-documents` bucket enforces:

- private bucket access (`public = false`)
- declared MIME allowlist:
  - `application/pdf`
  - `image/jpeg`
  - `image/png`
  - `image/webp`
- 10 MB maximum object size

## Storage RLS

Storage RLS enforces:

- authenticated object ownership
- approved path namespace
- final extension allowlist
- dangerous embedded filename extension rejection
- cross-user isolation
- no overwrite, update, or delete policy

## Application and server validation

The trusted product upload flows enforce:

- non-empty files
- 10 MB maximum size
- allowed MIME type
- MIME and final-extension consistency
- dangerous embedded/double extension rejection
- safe filenames
- no Storage call after validation failure
- no metadata write after validation failure
- cleanup and metadata authorization after accepted uploads

Covered product flows:

- `/admin/documents`
- `/employee/documents`

## Explicit non-goals

No current layer performs:

- malware scanning
- binary signature verification
- content sanitization
