-- Exact-record production cleanup for fixtures identified during the
-- 2026-08-13 QA audit. Ambiguous historical records are intentionally absent.

begin;

-- Leave fixtures: explicit QA/test markers or the known 2099 role-tree probe.
delete from public.notifications
where entity_id in (
  'c29a1546-77da-4f88-ac7d-c1ad9769c6b9',
  '42bfee3c-e087-409a-b657-98ea4fb26255',
  '565306c5-6e99-4a9b-83a4-2300fd57d0e6',
  '31afc575-7326-43ee-bf38-510664c089cf',
  '8fbef9ca-f334-45a9-8c79-e1a7c7b0e65a',
  '189b7a03-a659-4797-926b-49cfb07dc36a',
  '6bb57dc9-53a3-4c9b-a77a-8cf7f5e622e3',
  'a6b716fa-8c83-46a2-8157-ba495129b9b4',
  '54ba0257-914d-49fc-8a4f-857014532d3a',
  '1590c283-b7f5-4db1-ac88-8d58bdcf2243'
);

delete from public.leave_requests
where id in (
  'c29a1546-77da-4f88-ac7d-c1ad9769c6b9',
  '42bfee3c-e087-409a-b657-98ea4fb26255',
  '565306c5-6e99-4a9b-83a4-2300fd57d0e6',
  '31afc575-7326-43ee-bf38-510664c089cf',
  '8fbef9ca-f334-45a9-8c79-e1a7c7b0e65a',
  '189b7a03-a659-4797-926b-49cfb07dc36a',
  '6bb57dc9-53a3-4c9b-a77a-8cf7f5e622e3',
  'a6b716fa-8c83-46a2-8157-ba495129b9b4',
  '54ba0257-914d-49fc-8a4f-857014532d3a',
  '1590c283-b7f5-4db1-ac88-8d58bdcf2243'
);

-- Finance fixtures are retained as archived ledger evidence and excluded from
-- live balances/reports. The one legitimate unmarked transaction is untouched.
update public.finance_transactions
set archived_at = coalesce(archived_at, now()), updated_at = now()
where id in (
  '1074f5bc-7c7e-4d5a-9afe-d520bea1522f',
  'd47670af-e986-4099-b096-42d4fe305023',
  '6e48804b-4e8f-49f4-9c94-87361cceabf3',
  'a7d214eb-45dc-41ee-965e-edda21ee4eb0',
  '803291a8-9db3-4ed2-a20a-b894fe13bbf8',
  '7254e571-1632-4337-a100-deaf3307a2f1',
  '086e2b34-9121-47f9-aa01-b4fdfb2b31d0',
  'acbe1823-4b3e-4c9c-ada5-f54004a19449',
  '4f4a7ae1-a746-4fdb-8786-43c797789545',
  '2b40aecc-595a-498f-9556-2210654fc1a0',
  '56c6a2c8-66e0-4437-a56f-182f704a5609',
  '872f64f7-d7b4-4d4e-9be6-4573c1035c99',
  'd856d355-3128-41ac-a021-f64a1eca2fcc',
  'c6145745-7dc7-4135-b6fd-dfea3505c64e',
  '28091857-1f42-4fb9-aef4-2d251b611798'
);

update public.finance_invoices
set archived_at = coalesce(archived_at, now()), updated_at = now()
where id in (
  '669b7683-6295-4eaf-8a8b-d15371e0fbd9',
  'cda694df-ad2e-48c0-a3a7-1b0d5412d4ee',
  '64799697-19a5-4352-bc73-56c20135317a',
  'c78c0649-dce8-4c61-a495-6d245e2daf02',
  '597e717f-5482-4aba-8475-b0739ed7437b',
  'bcf39dcd-3dc6-4a35-a83f-5101092305f6',
  'cb29e093-6576-4a25-ace9-b2abd694a4a1'
);

update public.finance_accounts
set is_active = false, updated_at = now()
where id = '684cc475-1760-43f4-ae1a-c88fa938b1e0'
  and name = 'CODEX QA - CLEARING - 20260813081046';

update public.clients
set status = 'inactive'
where id = '22455cd9-e617-4c6d-9e78-97c8b03a5592'
  and name = 'CODEX QA - BILLING CLIENT - 20260813081046';

-- Every payroll entry in these runs belongs to a known QA-only profile.
delete from public.payroll_runs
where id in (
  '74279ef0-ef59-4ef2-8ef7-b50366753619',
  'ed946137-3ca3-491b-b13e-cf0b55f1f6ae',
  '08e6bcbd-46dc-417c-95b1-406d11b83d5a'
);

-- Database metadata for exact QA document fixtures. Storage objects are
-- removed by scripts/cleanup-production-qa-storage.mjs before this migration.
delete from public.notifications
where entity_id = '040717b8-a40b-4f3c-9e2b-331f41775d89';

delete from public.document_requests
where id = '040717b8-a40b-4f3c-9e2b-331f41775d89';

delete from public.documents
where id in (
  'ecebd0f5-da2e-4b92-9beb-5fcba2e971b4',
  'ea01f4a1-f180-4d98-a03b-ff5a952d48c9',
  '1dc8bc06-5e84-4f47-abd9-eb7c11355c3d',
  '787a41d2-370d-4206-b06c-9beaf937fd82',
  '6894b478-d9f6-4914-94c3-8267c2bc97ea'
);

-- Archive exact QA Innovation Hub parents so supports/comments stay
-- internally consistent as historical edges while normal lists become clean.
update public.ideas
set archived_at = coalesce(archived_at, now()),
    archived_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e',
    updated_at = now()
where id in (
  '12693c46-0561-4d7f-8042-5d84e3f06e7a',
  'de495485-a7c4-44c6-a1da-554ed274d5ae',
  '05f75238-e258-45dc-8480-6cefcaadec0f',
  '1784e9b0-d44e-4078-aa0a-ba12d995ba0f',
  '1669eccb-7875-42b1-9e0d-ccfb1fad18b3',
  'ac22f3b2-e398-4a0d-8226-5ea7b2462759',
  'f1f1cde3-215f-458e-9adb-bbd5a3a36dbe',
  '9ba13fe1-eff4-4225-8adb-e62771735562',
  'fa07f03e-c407-43cc-a856-39a7748c22f9',
  '7e5b21b0-5e80-4790-8e47-0d2df0dcefbd',
  '93f33368-3454-442b-8cdb-ef3f8a958837',
  'c5a23ab3-0432-41e7-8412-9ceada10727a'
);

update public.idea_attachments
set deleted_at = coalesce(deleted_at, now()),
    deleted_by = 'e64c5750-b585-4cab-9478-2c1fbad3b26e'
where id in (
  '0d976bc3-a892-4a9b-b59a-83e06bb90f5b',
  'acad01ce-e76e-44c7-8329-fffab91d3846'
);

delete from public.notifications
where entity_id in (
  '12693c46-0561-4d7f-8042-5d84e3f06e7a',
  'de495485-a7c4-44c6-a1da-554ed274d5ae',
  '05f75238-e258-45dc-8480-6cefcaadec0f',
  '1784e9b0-d44e-4078-aa0a-ba12d995ba0f',
  '1669eccb-7875-42b1-9e0d-ccfb1fad18b3',
  'ac22f3b2-e398-4a0d-8226-5ea7b2462759',
  'f1f1cde3-215f-458e-9adb-bbd5a3a36dbe',
  '9ba13fe1-eff4-4225-8adb-e62771735562',
  'fa07f03e-c407-43cc-a856-39a7748c22f9',
  '7e5b21b0-5e80-4790-8e47-0d2df0dcefbd',
  '93f33368-3454-442b-8cdb-ef3f8a958837',
  'c5a23ab3-0432-41e7-8412-9ceada10727a'
);

commit;
