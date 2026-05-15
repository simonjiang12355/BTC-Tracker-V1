# BTC Tracker

A static Bitcoin dashboard that shows:

- Live BTC price and market data
- Price trend chart
- On-chain valuation signals
- Fear & Greed sentiment
- Long-term power law model
- A heuristic summary view
- A latest BTC news section that refreshes on page load and has a daily GitHub Actions fallback
- A weekly BTC news sentiment check across up to 100 recent headlines

## Deploy To GitHub Pages

This project is a plain static website. You do not need a backend server to deploy it.

Files:

- `index.html`
- `styles.css`
- `app.js`
- `indicator-ui.js`
- `power-law.js`
- `forecasts.json`

## BTC News Refresh

The BTC news section is powered by `forecasts.json`.

When deployed to GitHub, `.github/workflows/update-forecasts.yml` runs once per day and uses `scripts/update-forecasts.mjs` to search Google News RSS for recent Bitcoin news. It writes the latest 10 items into `forecasts.json`, then deploys the site to GitHub Pages in the same workflow.

When a user opens the page, the browser also tries to fetch fresh Bitcoin news immediately. If that live request is blocked or fails, the page keeps showing the daily `forecasts.json` cache.

After the first upload, open the repository `Actions` tab and manually run `Update BTC Forecasts` once. After that, GitHub runs it daily on the default branch.

## Weekly Sentiment Refresh

The weekly sentiment section is powered by `sentiment.json`.

`.github/workflows/update-sentiment.yml` runs once per week and uses `scripts/update-sentiment.mjs` to search Google News RSS for recent Bitcoin news. It analyzes up to 100 items and writes bullish, neutral, and bearish counts into `sentiment.json`, then redeploys GitHub Pages.

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
