# Demo patient workflow

After applying migration `0038_demo_patient_marker.sql`, explicitly seed only a non-production Supabase project:

```powershell
$env:ALLOW_DEMO_PATIENT_SEED='true'; npm run seed:demo-patient
```

The command is idempotent and prints whether `DEMO-PAT-001` was created or already existed. It refuses to run without the flag or in production. It creates no document object or document metadata.

To remove only the marked demo patient and dependent demo records:

```powershell
$env:ALLOW_DEMO_PATIENT_SEED='true'; npm run cleanup:demo-patient
```

Cleanup requires both `patient_number = 'DEMO-PAT-001'` and `is_demo = true`; it never targets ordinary patient records.
