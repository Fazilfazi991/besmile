-- Remove former and QA-only clinician identities from operational scheduling
-- selectors while retaining every historical scheduling record.

update public.outsourced_doctors
set status = 'unavailable',
    archived_at = coalesce(archived_at, now()),
    archived_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    updated_at = now(),
    updated_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    notes = concat_ws(
      E'\n',
      nullif(notes, ''),
      'Archived during production user cleanup: former intern; historical scheduling records preserved.'
    )
where id = '9d510870-46cd-4637-ba1f-5896d442f758'
  and archived_at is null;

update public.outsourced_doctors
set status = 'unavailable',
    archived_at = coalesce(archived_at, now()),
    archived_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    updated_at = now(),
    updated_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    notes = concat_ws(
      E'\n',
      nullif(notes, ''),
      'Archived during production user cleanup: stale QA/test clinician entry; historical scheduling records preserved.'
    )
where id = '45e28a3c-784e-46dd-8723-50569f32024e'
  and archived_at is null;
