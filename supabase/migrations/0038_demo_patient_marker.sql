-- A stored marker keeps demonstration records identifiable without relying on names or contact details.
alter table public.patients add column if not exists is_demo boolean not null default false;
create index if not exists patients_demo_marker_idx on public.patients(is_demo) where is_demo=true;
