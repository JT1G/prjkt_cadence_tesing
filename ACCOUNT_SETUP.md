# Cadence account setup

Cadence had no backend configuration when this account layer was added, and no Supabase project is connected to this workspace. The app is ready to use Supabase Auth and Postgres once you provide a project URL and publishable key. No credentials have been invented or committed.

## 1. Create a Supabase project

Create or select a project in the Supabase dashboard. Cadence does not require a service-role key or database password in the browser.

## 2. Create the private data table

Open the project’s **SQL Editor**, paste the contents of [`supabase/migrations/20261118120000_cadence_account_data.sql`](supabase/migrations/20261118120000_cadence_account_data.sql), and run it once. This creates one JSONB record per Auth user, keyed by `user_id`, enables row-level security, grants only the signed-in operations the app needs, adds an ownership policy for each operation, and enables Postgres change notifications for cross-device sync.

The record preserves Cadence’s current state format: subjects (`courses`), assignments, planner events, Playbook notes, flashcard decks/cards, quiz data and results, study sessions, activity, and timer settings. The save function checks a revision number, so simultaneous edits from multiple devices return a visible conflict instead of silently replacing newer cloud data.

If the project restricts Data API exposure, expose `public.cadence_user_data` in **Project Settings → API → Data API**. The migration’s grants and row policies still restrict what each role can do and which rows they can access.

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

For local preview, run any static HTTP server from the project folder and add that origin to Supabase’s redirect allow list.
