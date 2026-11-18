# Cadence account setup

Cadence uses Supabase Auth, Postgres, Realtime, and private Storage. The project URL and publishable key are configured in `supabase-config.js`; never place a secret or service-role key there.

## 1. Create a Supabase project

Create or select a project in the Supabase dashboard. Cadence does not require a service-role key or database password in the browser.

## 2. Create the private data table

Open the project’s **SQL Editor**, paste the contents of [`supabase/migrations/20261118120000_cadence_account_data.sql`](supabase/migrations/20261118120000_cadence_account_data.sql), and run it once. This creates one JSONB record per Auth user, keyed by `user_id`, enables row-level security, grants only the signed-in operations the app needs, adds an ownership policy for each operation, and enables Postgres change notifications for cross-device sync.

The record preserves Cadence’s current state format: subjects (`courses`), assignments, planner events, Playbook notes, flashcard decks/cards, quiz data and results, study sessions, activity, and timer settings. The save function checks a revision number, so simultaneous edits from multiple devices return a visible conflict instead of silently replacing newer cloud data.

If the project restricts Data API exposure, expose `public.cadence_user_data` and `public.cadence_profiles` in **Project Settings → API → Data API**. The migrations’ grants and row policies still restrict what each role can do and which rows they can access.

## 2a. Add profile customization

Run [`supabase/migrations/20261118160000_cadence_profiles_and_avatars.sql`](supabase/migrations/20261118160000_cadence_profiles_and_avatars.sql) in the SQL Editor after the account-data migration. It creates the `cadence_profiles` row for each signed-in user and a private `cadence-avatars` Storage bucket. Users can access only their own profile and the single avatar object under their Auth user ID. The bucket accepts JPG, PNG, and WebP images up to 5 MB. Profile changes are included in Realtime for other signed-in devices.

## 2b. Account status and admin tools

The status migrations are [`supabase/migrations/20261119120000_cadence_account_status.sql`](supabase/migrations/20261119120000_cadence_account_status.sql) and [`supabase/migrations/20261119130000_cadence_status_rls_invoker.sql`](supabase/migrations/20261119130000_cadence_status_rls_invoker.sql). Together they add `status`, `ban_reason`, `banned_until`, and `status_updated_at` to `cadence_profiles`, default existing and new profiles to `active`, and update the RLS policies for study data and avatars. They have already been applied to the connected Supabase project. Apply both in order to any other Cadence Supabase project before using this version of the app. Keep the `private` schema out of the Data API's exposed schemas.

The trusted `cadence-admin` Edge Function is in [`supabase/functions/cadence-admin/index.ts`](supabase/functions/cadence-admin/index.ts); it has been deployed. It validates the signed-in user token itself because this project uses the newer publishable key format. Admin membership is an allowlist held only in Edge Function secrets. To enable your account as the first admin:

1. In Supabase, open **Table Editor → cadence_profiles** and copy the `user_id` for your own account.
2. Open **Edge Functions → Secrets**, add `CADENCE_ADMIN_USER_IDS` with that UUID as its value, and save. For more than one admin, separate UUIDs with commas.
3. Refresh Cadence or sign in again. The **Manage accounts** button will appear in your account panel.

Supabase supplies the function’s backend URL and server-only secret key. Do not copy those into Cadence or GitHub. The function checks the caller’s verified Auth session against the allowlist before using its privileged client.

In **Table Editor → cadence_profiles**, inspect `status` (`active`, `banned`, or `deleting`), `ban_reason`, `banned_until`, and `status_updated_at`. Normal status changes happen in Cadence’s **Manage accounts** panel, not by editing the table. A ban preserves the account and data; an optional end date automatically restores policy access after it passes. Deletion first changes status to `deleting`, then removes the avatar and deletes the Auth user; the existing foreign-key cascade removes the profile and study-data row. If cleanup fails, the account remains blocked as `deleting` so an admin can retry.

## 3. Configure email authentication

In **Authentication → Sign In / Providers**, enable Email and password sign-in and keep email confirmation enabled. In **Authentication → URL Configuration**, set the site URL and add the app’s local and deployed origins to the redirect allow list. For example, if you serve the folder at `http://localhost:8000`, allow that exact origin. Add the production site origin when you deploy.

Supabase’s built-in email delivery may have limits on production use. Configure a production SMTP provider in the Supabase Auth settings if confirmation and password-reset email delivery requires it.

## 4. Add the public client configuration

Copy the project URL and its **publishable key** from the Supabase project’s API settings into [`supabase-config.js`](supabase-config.js):

```js
window.CADENCE_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publishableKey: 'sb_publishable_YOUR_PUBLIC_KEY'
};
```

These values are intended for browser use. Never put a secret key, legacy service-role key, database password, or personal access token in this file.

The static app loads the pinned `@supabase/supabase-js` 2.119.0 browser build from jsDelivr. Serve the folder over HTTP or HTTPS; email callbacks do not work from a `file://` URL.

## 5. Use accounts and import existing browser data

Guests keep using the existing `cadence.v1` browser record. Supabase Auth stores its session separately; signed-in study data is read from and written to Postgres, never copied into the guest key.

After sign-up and email confirmation, or after sign-in, Cadence offers to merge the current browser’s guest records into the account. **Keep separate** leaves the guest data in place and the account panel keeps an **Import browser data** action for later. An import records a fingerprint in the account row, making a retry of the same guest snapshot safe. Successful import does not remove the browser copy.

On sign-out Cadence immediately replaces the in-memory account state with guest state. Realtime changes from another signed-in device are applied when there are no local edits pending; returning to the page also refreshes the account record. If another device has already saved a newer revision, Cadence asks you to reload the cloud copy before continuing.

## 6. Test the setup manually

1. Create an account and confirm the email.
2. Add a subject and some notes or flashcards. Check `public.cadence_user_data` in the Supabase table editor; the row’s `user_id` should match the signed-in Auth user.
3. Sign in to the same account in a second browser/device and confirm that the records load.
4. Sign in as a different account and confirm that it sees only its own row.
5. On a browser with guest data, sign in and try both **Import browser data** and **Keep separate**.
6. Use password reset and sign out. Confirm the guest state appears after sign-out.
7. Open **Edit profile**, change the display name, upload or remove a picture, then sign in to the same account on another device to confirm the profile appears there too.
8. After adding your admin UUID to the function secret, use **Manage accounts** to ban a separate test account. In that account’s active browser, confirm the blocked message appears from Realtime (or within the 30-second fallback), and confirm its account-scoped queries are rejected by RLS. Reactivate it and test permanent deletion only with a disposable test account.

For local preview, run any static HTTP server from the project folder and add that origin to Supabase’s redirect allow list.

