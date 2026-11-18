# Wefans

A static creative-services marketplace with optional Supabase authentication, public freelancer listings, and private realtime messaging.

## Files

- `index.html` - website and browser interactions.
- `messages.html` and `messages-app.js` - full-page private conversation inbox and chat.
- `supabase-client.js` - browser-side Supabase integration.
- `supabase-config.js` - public Supabase project URL and publishable/anon key.
- `supabase-schema.sql` - database tables, triggers, grants, and row-level security policies.

## Supabase setup

The live Wefans site is connected to its Supabase project. Its schema is in `supabase-schema.sql`; it creates profiles, freelancer listings, private conversations, messages, realtime updates, and row-level security policies.

For a separate deployment or fork:

1. Create a Supabase project and run `supabase-schema.sql` in its SQL Editor.
2. Set `url` and `anonKey` in `supabase-config.js` to that project's URL and **publishable** key (or legacy anon key).
3. In Supabase **Authentication > URL Configuration**, set the site URL to your deployed site and add `http://localhost:8000/` as a redirect URL for local testing.
4. Upload the updated files and wait for GitHub Pages to redeploy.

The checked-in config contains only the Wefans project URL and public publishable key. **Never put a Supabase `service_role` or secret key in this website or repository.** Row-level security policies protect user data.

Once connected, people can sign up as clients or freelancers, freelancers can update their public profile and publish services, and authenticated conversation participants can exchange persistent realtime messages. Contacting a published service opens its conversation on the full-page Messages screen. The existing conversations, messages, row-level security, and Realtime setup support this page; no extra database tables are required. Email confirmation may be enabled in Supabase Auth settings.

## Publish with GitHub Pages

The repository is configured to publish from the `main` branch and repository root. GitHub Pages redeploys after each commit.

## Run locally

From this folder, run:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Prototype notes

The built-in sample sellers, ratings, reviews, and prices are examples, not real provider accounts. Only listings created by registered freelancer accounts are connected to the database and can receive messages. The site does not process orders or payments.

Portfolio photos load from Unsplash and require an internet connection.
