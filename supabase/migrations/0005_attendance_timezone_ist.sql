insert into public.company_attendance_settings(id,timezone) values(true,'Asia/Kolkata') on conflict(id) do update set timezone='Asia/Kolkata';
