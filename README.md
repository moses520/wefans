# Wefans

A responsive static prototype for an independent creative-services marketplace.

## Files

- `index.html` - complete website, styles, sample listings, and browser-side interactions.
- `README.md` - setup and deployment instructions.

No build step, package installation, or server-side code is required.

## Publish with GitHub Pages

1. Create a GitHub repository.
2. Upload `index.html` and `README.md` to the repository root.
3. In the repository, open **Settings > Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Choose the `main` branch and `/ (root)`, then save.
6. Wait for GitHub Pages to publish the URL shown in the Pages settings.

## Run locally

From this folder, run:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Prototype notes

The site includes search, category filters, sample freelancer profiles, profile
dialogs, a 20-item freelance pricing guide, signup/login forms, and a chat
interface. Listings and prices are examples. Authentication and checkout are
not connected to a backend. Chat messages are stored only in the current
browser and are not delivered to freelancers.

Portfolio photos load from Unsplash and require an internet connection.
