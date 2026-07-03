# Manual Supabase Migration Guide

Use this guide if you are updating the Supabase database manually instead of running Prisma migrations.

## Steps

1. Open the Supabase project for Roamly.
2. Go to **SQL Editor**.
3. Open [2026-07-03-onboarding-profile-rich-itinerary.sql](./2026-07-03-onboarding-profile-rich-itinerary.sql).
4. Paste the full SQL into the Supabase SQL Editor.
5. Click **Run**.
6. In the local project, run:

```bash
npm run db:generate
```

7. Verify the `profiles` table has these columns:
   - `country`
   - `region`
   - `preferredCurrency`
   - `travelInterests`
   - `preferredLanguage`
   - `profileComplete`
8. Verify the `exchange_rates` table exists with a unique index on `baseCurrency` and `quoteCurrency`.

## Notes

- Existing profiles default to `profileComplete = false`.
- Existing users will be routed to `/profile/setup` until the required fields are saved.
- The exchange-rate cache starts empty. The app fills it after successful live Frankfurter lookups.
