# Render setup

This project is a small Node server (`server.js`) that:

- Serves the static site (`index.html`, `styles.css`, `script.js`)
- Provides `GET /api/publish-date?url=https://example.com/article` to fetch an article HTML and extract publish metadata

## Deploy (recommended)

1. Push this repo to GitHub.
2. In Render: **New +** → **Web Service** → connect the repo.
3. Use:
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. Deploy.

After deploy:

- Visit `/health` to confirm the backend is up.
- Visit the root `/` to load the site.

## Local run

```bash
npm start
```

Then open `http://127.0.0.1:3000`.

## API example

```bash
curl "http://127.0.0.1:3000/api/publish-date?url=https%3A%2F%2Fexample.com"
```

