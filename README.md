# Wefans

A static creative-services marketplace with optional Supabase authentication, public freelancer listings, and private realtime messaging.

## Files

- `index.html` - website and browser interactions.
- `supabase-client.js` - browser-side Supabase integration.
- `supabase-config.js` - public Supabase project URL and publishable/anon key.
- `supabase-schema.sql` - database tables, triggers, grants, and row-level security policies.

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL Editor, run the contents of `supabase-schema.sql`.
3. In `supabase-config.js`, set `url` to the project's URL and `anonKey` to its publishable key (or legacy anon key).
4. In Supabase **Authentication > URL Configuration**, set the site URL to `https://moses520.github.io/wefans/` and add `http://localhost:8000/` as a redirect URL for local testing.
5. Upload the updated Wefans files to the repository and wait for GitHub Pages to redeploy.

The browser key is designed for public use; the database's row-level security policies protect user data. **Never put a Supabase `service_role` or secret key in this website or repository.** Run the SQL schema before connecting the project. Email confirmation may be enabled in the Supabase Auth settings.

Once connected, people can sign up as clients or freelancers, freelancers can update their public profile and publish services, and authenticated conversation participants can exchange persistent realtime messages.

The checked-in configuration is intentionally blank. Until you add your own project URL and public key, the site continues to show sample listings and database features remain disabled.

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
