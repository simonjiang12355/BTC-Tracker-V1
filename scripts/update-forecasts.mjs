import fs from "node:fs/promises";

const OUTPUT = new URL("../forecasts.json", import.meta.url);
const SEARCHES = [
  "bitcoin OR BTC latest news when:7d",
  "bitcoin ETF OR BTC ETF news when:7d",
  "bitcoin market price news when:7d",
  "bitcoin regulation mining company news when:7d",
];
const MAX_PER_SOURCE = 2;
const MAX_ITEMS = 10;

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

function stripTags(value = "") {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractTag(item, tag) {
  const match = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeEntities(match[1]) : "";
}

function extractSource(item, link) {
  const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/i);
  if (sourceMatch) return stripTags(sourceMatch[1]);
  try {
    return new URL(link).hostname.replace(/^www\./, "");
  } catch {
    return "Source";
  }
}

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    const title = stripTags(extractTag(item, "title"));
    const description = stripTags(extractTag(item, "description"));
    const link = extractTag(item, "link");
    const pubDate = extractTag(item, "pubDate");
    return {
      title,
      description,
      url: link,
      date: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      source: extractSource(item, link),
    };
  });
}

function classify(text) {
  const lower = text.toLowerCase();
  if (/\b(crash|collapse|bearish|downside|plunge|drop|fall|risk|sell|bleed|fear)\b/.test(lower)) {
    return "bearish";
  }
  if (/\b(rally|bullish|upside|surge|breakout|target|reach|run|buy|ath|record)\b/.test(lower)) {
    return "bullish";
  }
  return "neutral";
}

function summarize(item) {
  const base = item.description || item.title;
  const sentence = base.split(/(?<=[.!?])\s+/)[0] || item.title;
  return sentence.length > 180 ? `${sentence.slice(0, 177).trim()}...` : sentence;
}

function isRelevant(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return (
    /\b(bitcoin|btc)\b/.test(text) &&
    /\b(news|market|price|etf|fund|mining|miner|regulation|policy|reserve|treasury|company|exchange|rally|crash|record|inflow|outflow|adoption|strategy)\b/.test(text)
  );
}

async function fetchSearch(query) {
  const url = new URL("https://news.google.com/rss/search");
  url.searchParams.set("q", query);
  url.searchParams.set("hl", "en-US");
  url.searchParams.set("gl", "US");
  url.searchParams.set("ceid", "US:en");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "BTC Tracker forecast updater",
        accept: "application/rss+xml,text/xml",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Google News RSS failed: ${response.status}`);
    return parseRss(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

function pickForecasts(items) {
  const seenUrls = new Set();
  const sourceCounts = new Map();
  const sorted = items
    .filter(isRelevant)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  const selected = [];
  for (const item of sorted) {
    if (!item.url || seenUrls.has(item.url)) continue;
    const sourceKey = item.source.toLowerCase();
    if ((sourceCounts.get(sourceKey) || 0) >= MAX_PER_SOURCE) continue;
    seenUrls.add(item.url);
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
    selected.push({
      date: item.date,
      source: item.source,
      url: item.url,
      summary: summarize(item),
      stance: classify(`${item.title} ${item.description}`),
    });
    if (selected.length >= MAX_ITEMS) break;
  }

  return selected;
}

const results = [];
for (const query of SEARCHES) {
  try {
    results.push(...await fetchSearch(query));
  } catch (error) {
    console.warn(error.message);
  }
}

const forecasts = pickForecasts(results);
if (!forecasts.length) {
  throw new Error("No BTC news found from Google News RSS.");
}

await fs.writeFile(
  OUTPUT,
  `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: "Google News RSS latest BTC news",
    forecasts,
  }, null, 2)}\n`,
);

console.log(`Updated ${forecasts.length} BTC news items.`);
