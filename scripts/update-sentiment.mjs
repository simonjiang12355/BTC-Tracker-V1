import fs from "node:fs/promises";

const OUTPUT = new URL("../sentiment.json", import.meta.url);
const MAX_ITEMS = 100;
const SEARCHES = [
  "bitcoin OR BTC latest news when:7d",
  "bitcoin ETF OR BTC ETF news when:7d",
  "bitcoin market price news when:7d",
  "bitcoin regulation mining company news when:7d",
  "bitcoin adoption treasury exchange news when:7d",
];

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

function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    return {
      title: stripTags(extractTag(item, "title")),
      description: stripTags(extractTag(item, "description")),
      url: extractTag(item, "link"),
      date: extractTag(item, "pubDate"),
    };
  });
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
        "user-agent": "BTC Tracker sentiment updater",
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

function isRelevant(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return /\b(bitcoin|btc)\b/.test(text);
}

function classify(text) {
  const lower = text.toLowerCase();
  const bullishPatterns = [
    /\brall(y|ies|ied)\b/, /\bsurge(s|d)?\b/, /\bjump(s|ed)?\b/, /\bgain(s|ed)?\b/,
    /\brise(s|n)?\b/, /\bclimb(s|ed)?\b/, /\bsoar(s|ed)?\b/, /\bbull(s|ish)?\b/,
    /\bbreakout\b/, /\brecord high\b/, /\ball[- ]time high\b/, /\binflow(s)?\b/,
    /\bbuy(s|ing)?\b/, /\baccumulat(e|es|ed|ing)\b/, /\badoption\b/, /\bapproval\b/,
    /\breserve\b/, /\btreasury\b/, /\binstitutional\b/, /\bdemand\b/, /\boptimis(m|tic)\b/,
    /\bupside\b/, /\brecover(s|ed|y)?\b/, /\brebound(s|ed)?\b/, /\badd(s|ed)? bitcoin\b/,
    /\braise(s|d)? target\b/, /\babove \$?\d+/,
  ];
  const bearishPatterns = [
    /\bcrash(es|ed)?\b/, /\bdrop(s|ped)?\b/, /\bfall(s|en)?\b/, /\bplunge(s|d)?\b/,
    /\bslump(s|ed)?\b/, /\bdecline(s|d)?\b/, /\bsell[- ]?off\b/, /\boutflow(s)?\b/,
    /\bbear(s|ish)?\b/, /\brisk(s)?\b/, /\bhack(s|ed)?\b/, /\blawsuit(s)?\b/,
    /\bban(s|ned)?\b/, /\bprobe(s)?\b/, /\bfraud\b/, /\bfear\b/, /\bliquidation(s)?\b/,
    /\bloss(es)?\b/, /\bdownside\b/, /\bwarning\b/, /\bpressure\b/, /\bbelow \$?\d+/,
    /\bfaces? (pressure|risk|probe|lawsuit)\b/, /\bcut(s)? target\b/,
  ];
  const bullish = bullishPatterns.reduce((score, pattern) => score + (pattern.test(lower) ? 1 : 0), 0);
  const bearish = bearishPatterns.reduce((score, pattern) => score + (pattern.test(lower) ? 1 : 0), 0);

  if (bullish > bearish) return "bullish";
  if (bearish > bullish) return "bearish";
  return "neutral";
}

const results = [];
for (const query of SEARCHES) {
  try {
    results.push(...await fetchSearch(query));
  } catch (error) {
    console.warn(error.message);
  }
}

const seen = new Set();
const items = results
  .filter(isRelevant)
  .filter((item) => {
    if (!item.url || seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  })
  .sort((a, b) => new Date(b.date) - new Date(a.date))
  .slice(0, MAX_ITEMS);

if (!items.length) {
  throw new Error("No BTC news found for sentiment check.");
}

const counts = { bullish: 0, neutral: 0, bearish: 0 };
for (const item of items) {
  counts[classify(`${item.title} ${item.description}`)] += 1;
}

await fs.writeFile(
  OUTPUT,
  `${JSON.stringify({
    updatedAt: new Date().toISOString(),
    source: "Google News RSS weekly sentiment",
    total: items.length,
    counts,
  }, null, 2)}\n`,
);

console.log(`Updated weekly sentiment from ${items.length} BTC news items.`);
