# Supabase backend

This project expects a Supabase project but does not contain a secret or service-role key.

Browser configuration uses:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Keep privileged keys server-side only. Database recipe fragments generated under `supabase/schema/` are reviewed source inputs; create/apply real migrations with the Supabase CLI or your approved database workflow rather than inventing migration history files.

Tables intended for browser Data API access must have explicit grants and Row Level Security policies. The generated fragments follow that rule.
