# BTC Tracker

A static Bitcoin dashboard that shows:

- Live BTC price and market data
- Price trend chart
- On-chain valuation signals
- Fear & Greed sentiment
- Long-term power law model
- A heuristic summary view
- A daily refreshed web-summary section for BTC forecasts

## Deploy To GitHub Pages

This project is a plain static website. You do not need a backend server to deploy it.

Files:

- `index.html`
- `styles.css`
- `app.js`
- `indicator-ui.js`
- `power-law.js`
- `forecasts.json`

## Daily Forecast Refresh

The BTC forecast section is powered by `forecasts.json`.

When deployed to GitHub, `.github/workflows/update-forecasts.yml` runs once per day and uses `scripts/update-forecasts.mjs` to search Google News RSS for recent Bitcoin price predictions. It writes the latest 10 items into `forecasts.json`, and the deploy workflow republishes the site after the update commit.

## Option 1: Upload Directly

1. Create a GitHub repository.
2. Upload all files from this folder to the repository root.
3. In GitHub, open `Settings` -> `Pages`.
4. Under `Build and deployment`, choose `GitHub Actions`.
5. Push to the `main` branch.

The included workflow will publish the site automatically.

## Option 2: Drag-And-Drop To Any Static Host

You can also deploy the same files to:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages

## Local Preview

You can preview locally with any static server.

Example:

```bash
python -m http.server 4173
```

Then open:

```text
http://127.0.0.1:4173/
```

## Notes

- This app fetches data directly from public third-party APIs in the browser.
- Availability depends on those upstream APIs and their browser CORS policies.
- The composite recommendation is heuristic only and is not investment advice.
