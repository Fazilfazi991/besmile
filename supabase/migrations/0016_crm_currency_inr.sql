alter table public.crm_sales alter column currency set default 'INR';
update public.crm_sales set currency = 'INR' where currency = 'AED';
