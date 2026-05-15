const API_BASE = "https://api.coingecko.com/api/v3/coins/markets";
const MARKET_CHART_BASE = "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart";
const CRYPTOCOMPARE_BASE = "https://min-api.cryptocompare.com/data/v2";
const COINBASE_CANDLES_BASE = "https://api.exchange.coinbase.com/products/BTC-USD/candles";
const COINPAPRIKA_TICKER = "https://api.coinpaprika.com/v1/tickers/btc-bitcoin";
const KRAKEN_TICKER = "https://api.kraken.com/0/public/Ticker?pair=XBTUSD";
const KRAKEN_OHLC_BASE = "https://api.kraken.com/0/public/OHLC";
const COIN_METRICS_BASE =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics";
const FEAR_GREED_BASE = "https://api.alternative.me/fng/";
const CACHE_PREFIX = "btc-tracker:v2:";
const UI_THEME_KEY = "btc-tracker:ui-theme";
const REFRESH_MS = 60_000;
const DEFAULT_CHART_DAYS = 7;
const MARKET_CACHE_TTL_MS = 30_000;
const CHART_CACHE_TTL_MS = 30_000;
const ONCHAIN_CACHE_TTL_MS = 15 * 60_000;
const SENTIMENT_CACHE_TTL_MS = 15 * 60_000;
const CHART_RANGES = {
  1: "1 day",
  7: "7 days",
  30: "30 days",
  60: "60 days",
  90: "90 days",
  180: "180 days",
  365: "1 year",
  730: "2 years",
  1825: "5 years",
};

const state = {
  currency: "usd",
  chartDays: DEFAULT_CHART_DAYS,
  timer: null,
  chartSeries: [],
  chartCoords: [],
  chartPlot: null,
  chartCurrency: "usd",
  chartSource: "CoinGecko",
  hoverIndex: null,
  latestSignals: null,
  powerLawSummary: null,
};

const els = {
  currency: document.querySelector("#currency"),
  uiTheme: document.querySelector("#ui-theme"),
  refresh: document.querySelector("#refresh"),
  share: document.querySelector("#share"),
  shareStatus: document.querySelector("#share-status"),
  status: document.querySelector("#status"),
  price: document.querySelector("#price"),
  change24h: document.querySelector("#change-24h"),
  lastUpdated: document.querySelector("#last-updated"),
  marketCap: document.querySelector("#market-cap"),
  volume: document.querySelector("#volume"),
  high24h: document.querySelector("#high-24h"),
  low24h: document.querySelector("#low-24h"),
  chartRangeLabel: document.querySelector("#chart-range-label"),
  trendLabel: document.querySelector("#trend-label"),
  canvas: document.querySelector("#sparkline"),
  chartTooltip: document.querySelector("#chart-tooltip"),
  rangeTabs: [...document.querySelectorAll(".range-tab")],
  change1h: document.querySelector("#change-1h"),
  changeCard24h: document.querySelector("#change-card-24h"),
  change7d: document.querySelector("#change-7d"),
  change30d: document.querySelector("#change-30d"),
  ath: document.querySelector("#ath"),
  athDate: document.querySelector("#ath-date"),
  athDays: document.querySelector("#ath-days"),
  athChange: document.querySelector("#ath-change"),
  nupl: document.querySelector("#nupl"),
  nuplAxis: document.querySelector("#nupl-axis"),
  puell: document.querySelector("#puell"),
  puellAxis: document.querySelector("#puell-axis"),
  mvrv: document.querySelector("#mvrv"),
  mvrvAxis: document.querySelector("#mvrv-axis"),
  onchainUpdated: document.querySelector("#onchain-updated"),
  fearGreedValue: document.querySelector("#fear-greed-value"),
  fearGreedMeter: document.querySelector("#fear-greed-meter"),
  fearGreedLabel: document.querySelector("#fear-greed-label"),
  fearGreedDate: document.querySelector("#fear-greed-date"),
  infoLinks: [...document.querySelectorAll(".info-link")],
  powerLawCanvas: document.querySelector("#power-law-chart"),
  powerLawTooltip: document.querySelector("#power-law-tooltip"),
  powerLawStatus: document.querySelector("#power-law-status"),
  powerLawPrice: document.querySelector("#power-law-price"),
  powerLawPriceDate: document.querySelector("#power-law-price-date"),
  powerLawResistance: document.querySelector("#power-law-resistance"),
  powerLawModelDate: document.querySelector("#power-law-model-date"),
  powerLawFit: document.querySelector("#power-law-fit"),
  powerLawSupport: document.querySelector("#power-law-support"),
  recommendationAction: document.querySelector("#recommendation-action"),
  recommendationBadge: document.querySelector("#recommendation-badge"),
  recommendationSummary: document.querySelector("#recommendation-summary"),
  recommendationConfidence: document.querySelector("#recommendation-confidence"),
  forecastUpdated: document.querySelector("#forecast-updated"),
  forecastRefresh: document.querySelector("#forecast-refresh"),
  forecastList: document.querySelector("#forecast-list"),
  weeklySentimentUpdated: document.querySelector("#weekly-sentiment-updated"),
  weeklyBullish: document.querySelector("#weekly-bullish"),
  weeklyNeutral: document.querySelector("#weekly-neutral"),
  weeklyBearish: document.querySelector("#weekly-bearish"),
  weeklySentimentTotal: document.querySelector("#weekly-sentiment-total"),
};

function applyUiTheme(theme) {
  const nextTheme = ["blue", "light", "terminal"].includes(theme) ? theme : "blue";
  document.body.dataset.ui = nextTheme;
  if (els.uiTheme) els.uiTheme.value = nextTheme;
  try {
    window.localStorage.setItem(UI_THEME_KEY, nextTheme);
  } catch {
    // Theme persistence is best effort.
  }
}

function loadUiTheme() {
  try {
    return window.localStorage.getItem(UI_THEME_KEY) || "blue";
  } catch {
    return "blue";
  }
}

const currencyMeta = {
  usd: { code: "USD", locale: "en-US" },
  cny: { code: "CNY", locale: "zh-CN" },
};

function money(value, compact = false, digits = null) {
  return moneyFor(value, state.currency, compact, digits);
}

function moneyFor(value, currency, compact = false, digits = null) {
  if (!Number.isFinite(value)) return "--";
  const meta = currencyMeta[currency] || currencyMeta.usd;
  const maximumFractionDigits = digits ?? (compact || Math.abs(value) >= 1000 ? 0 : 2);
  return new Intl.NumberFormat(meta.locale, {
    style: "currency",
    currency: meta.code,
    minimumFractionDigits: digits ?? undefined,
    maximumFractionDigits,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function chartMoney(value, compact = false, digits = null) {
  return moneyFor(value, state.chartCurrency, compact, digits);
}

function number(value, compact = true) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("zh-CN", {
    maximumFractionDigits: value >= 1000 ? 0 : 2,
    notation: compact ? "compact" : "standard",
  }).format(value);
}

function percent(value) {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function ratio(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function dateTime(value) {
  if (!value) return "--";
  return `${formatDate(value)} ${formatTime(value)}`;
}

function dateOnly(value) {
  if (!value) return "--";
  return formatDate(value);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}

function daysSince(value) {
  if (!value) return null;
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return null;
  const diff = Date.now() - then;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function setSigned(el, value) {
  el.textContent = percent(value);
  el.classList.toggle("up", value > 0);
  el.classList.toggle("down", value < 0);
  el.classList.toggle("neutral", !Number.isFinite(value) || value === 0);
}

function updateStatus(message, isError = false) {
  els.status.textContent = message;
  els.status.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function updateShareStatus(message, isError = false) {
  els.shareStatus.textContent = message;
  els.shareStatus.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function stampUpdated(el, value) {
  if (!el) return;
  let stamp = el.nextElementSibling;
  if (!stamp?.classList.contains("data-updated")) {
    stamp = document.createElement("small");
    stamp.className = "data-updated";
    el.insertAdjacentElement("afterend", stamp);
  }
  stamp.textContent = `最后更新：${dateTime(value || Date.now())}`;
}

function endpoint() {
  const params = new URLSearchParams({
    vs_currency: state.currency,
    ids: "bitcoin",
    order: "market_cap_desc",
    per_page: "1",
    page: "1",
    sparkline: "false",
    price_change_percentage: "1h,24h,7d,30d",
    locale: "zh",
  });

  return `${API_BASE}?${params.toString()}`;
}

function cryptoCompareMarketEndpoint(currency) {
  const params = new URLSearchParams({
    fsyms: "BTC",
    tsyms: currency.toUpperCase(),
  });

  return `${CRYPTOCOMPARE_BASE}/pricemultifull?${params.toString()}`;
}

function coinPaprikaMarketEndpoint() {
  return COINPAPRIKA_TICKER;
}

function marketChartEndpoint(days = 365, currency = "usd") {
  const params = new URLSearchParams({
    vs_currency: currency,
    days: String(days),
  });

  if (days === "max" || days >= 90) params.set("interval", "daily");

  return `${MARKET_CHART_BASE}?${params.toString()}`;
}

function coinbaseCandlesEndpoints(days) {
  const granularity = coinbaseGranularity(days);
  const endMs = Date.now();
  const startMs = endMs - days * 86_400_000;
  const chunkMs = granularity * 1000 * 300;
  const endpoints = [];

  for (let chunkStart = startMs; chunkStart < endMs; chunkStart += chunkMs) {
    const chunkEnd = Math.min(chunkStart + chunkMs, endMs);
    endpoints.push(coinbaseCandlesEndpoint(chunkStart, chunkEnd, granularity));
  }

  return endpoints;
}

function krakenOhlcEndpoint(days) {
  const params = new URLSearchParams({
    pair: "XBTUSD",
    interval: String(krakenInterval(days)),
  });

  return `${KRAKEN_OHLC_BASE}?${params.toString()}`;
}

function krakenInterval(days) {
  if (days <= 1) return 5;
  if (days <= 7) return 60;
  return 1440;
}

function cryptoCompareEndpoint(days, currency, toTs = null) {
  const isHourly = days <= 7;
  const endpoint = isHourly ? "histohour" : "histoday";
  const limit = isHourly ? Math.max(24, days * 24) : days;
  const params = new URLSearchParams({
    fsym: "BTC",
    tsym: currency.toUpperCase(),
    limit: String(limit),
  });
  if (toTs) params.set("toTs", String(toTs));

  return `${CRYPTOCOMPARE_BASE}/${endpoint}?${params.toString()}`;
}

function coinbaseCandlesEndpoint(startMs, endMs, granularity) {
  const params = new URLSearchParams({
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    granularity: String(granularity),
  });

  return `${COINBASE_CANDLES_BASE}?${params.toString()}`;
}

function coinbaseGranularity(days) {
  if (days <= 1) return 300;
  if (days <= 7) return 3600;
  if (days <= 60) return 21_600;
  return 86_400;
}

function mvrvEndpoint() {
  const params = new URLSearchParams({
    assets: "btc",
    metrics: "CapMVRVCur",
    frequency: "1d",
    page_size: "1",
  });

  return `${COIN_METRICS_BASE}?${params.toString()}`;
}

function fearGreedEndpoint() {
  const params = new URLSearchParams({
    limit: "1",
    format: "json",
  });

  return `${FEAR_GREED_BASE}?${params.toString()}`;
}

async function fetchJson(url, options = {}) {
  const retries = options.retries ?? 1;
  const timeout = options.timeout ?? 12_000;
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(350 * (attempt + 1));
    } finally {
      window.clearTimeout(timer);
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonCached(key, url) {
  return fetchJsonCachedWithOptions(key, url);
}

async function fetchJsonCachedWithOptions(key, url, options = {}) {
  const maxAge = options.maxAge ?? 0;
  const cachedEntry = readCacheEntry(key);

  if (cachedEntry && maxAge > 0 && Date.now() - cachedEntry.savedAt <= maxAge) {
    return cachedEntry.data;
  }

  try {
    const data = await fetchJson(url);
    writeCache(key, data);
    return data;
  } catch (error) {
    if (cachedEntry?.data) return cachedEntry.data;
    throw error;
  }
}

function readCache(key) {
  return readCacheEntry(key)?.data || null;
}

function readCacheEntry(key) {
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    window.localStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ savedAt: Date.now(), data }),
    );
  } catch {
    // Cache is best effort; private browsing or quota limits should not break the dashboard.
  }
}

async function fetchMarketData(currency) {
  const cached = readCacheEntry(`market:${currency}`);
  if (cached && Date.now() - cached.savedAt <= MARKET_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const payload = await fetchJson(endpoint());
    const [coin] = payload;
    if (coin) {
      const result = { coin: { ...coin, currency, source: "CoinGecko" }, source: "CoinGecko" };
      writeCache(`market:${currency}`, result);
      return result;
    }
  } catch (error) {
    console.warn("CoinGecko market failed, trying CryptoCompare", error);
  }

  try {
    const payload = await fetchJson(cryptoCompareMarketEndpoint(currency));
    const coin = normalizeCryptoCompareMarket(payload, currency);
    if (coin) {
      const result = { coin, source: "CryptoCompare" };
      writeCache(`market:${currency}`, result);
      return result;
    }
  } catch (error) {
    console.warn("CryptoCompare market failed, trying CoinPaprika", error);
  }

  try {
    const payload = await fetchJson(coinPaprikaMarketEndpoint());
    const coin = normalizeCoinPaprikaMarket(payload);
    if (coin) {
      const result = { coin, source: "CoinPaprika" };
      writeCache(`market:${currency}`, result);
      return result;
    }
  } catch (error) {
    console.warn("CoinPaprika market failed, trying Kraken", error);
  }

  try {
    const payload = await fetchJson(KRAKEN_TICKER);
    const coin = normalizeKrakenMarket(payload);
    if (coin) {
      const result = { coin, source: "Kraken" };
      writeCache(`market:${currency}`, result);
      return result;
    }
  } catch (error) {
    console.warn("Kraken market failed, trying cache", error);
  }

  const fallbackCached = readCache(`market:${currency}`) || readCache("market:usd");
  if (fallbackCached) return fallbackCached;

  throw new Error("No BTC market data returned from fallback sources");
}

async function fetchChartData(days, currency) {
  const cached = readCacheEntry(`chart:${currency}:${days}`);
  if (cached && Date.now() - cached.savedAt <= CHART_CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const payload = await fetchJson(marketChartEndpoint(days, currency));
    const series = parseChartSeries(payload);
    if (series.length >= 2) {
      const result = { payload, series, source: "CoinGecko", currency };
      writeCache(`chart:${currency}:${days}`, result);
      return result;
    }
  } catch (error) {
    console.warn("CoinGecko chart failed, trying CryptoCompare", error);
  }

  try {
    const payload = await fetchJson(cryptoCompareEndpoint(days, currency));
    const series = parseCryptoCompareSeries(payload);
    if (series.length >= 2) {
      const result = {
        payload: { prices: series.map((point) => [point.time, point.price]) },
        series,
        source: "CryptoCompare",
        currency,
      };
      writeCache(`chart:${currency}:${days}`, result);
      return result;
    }
  } catch (error) {
    console.warn("CryptoCompare chart failed, trying Kraken", error);
  }

  try {
    const payload = await fetchJson(krakenOhlcEndpoint(days));
    const series = parseKrakenOhlc(payload, days);
    if (series.length >= 2) {
      const result = {
        payload: { prices: series.map((point) => [point.time, point.price]) },
        series,
        source: "Kraken",
        currency: "usd",
      };
      writeCache(`chart:${currency}:${days}`, result);
      return result;
    }
  } catch (error) {
    console.warn("Kraken chart failed, trying Coinbase", error);
  }

  try {
    const chunks = await Promise.all(coinbaseCandlesEndpoints(days).map((url) => fetchJson(url)));
    const candles = chunks.flat();
    const series = parseCoinbaseCandles(candles);
    if (series.length < 2) throw new Error("Coinbase candles returned no chart data");
    const result = {
      payload: { prices: series.map((point) => [point.time, point.price]) },
      series,
      source: "Coinbase",
      currency: "usd",
    };
    writeCache(`chart:${currency}:${days}`, result);
    return result;
  } catch (error) {
    console.warn("Coinbase chart failed, trying cache", error);
  }

  const fallbackCached = readCache(`chart:${currency}:${days}`) || readCache(`chart:usd:${days}`);
  if (fallbackCached) return fallbackCached;

  throw new Error("No BTC chart data returned from fallback sources");
}

async function loadBitcoin() {
  els.refresh.disabled = true;
  updateStatus("正在更新 BTC 数据...");

  try {
    const [marketResult, chartResult, annualChartResult, mvrvResult, fearGreedResult] =
      await Promise.allSettled([
        fetchMarketData(state.currency),
        fetchChartData(state.chartDays, state.currency),
        fetchJsonCachedWithOptions("annual-chart:usd", marketChartEndpoint(365, "usd"), {
          maxAge: ONCHAIN_CACHE_TTL_MS,
        }),
        fetchJsonCachedWithOptions("mvrv:btc", mvrvEndpoint(), {
          maxAge: ONCHAIN_CACHE_TTL_MS,
        }),
        fetchJsonCachedWithOptions("fear-greed", fearGreedEndpoint(), {
          maxAge: SENTIMENT_CACHE_TTL_MS,
        }),
      ]);

    const chartData = chartResult.status === "fulfilled"
      ? chartResult.value
      : cachedChartState();
    const market = marketResult.status === "fulfilled"
      ? marketResult.value
      : synthesizeMarketFromChart(chartData);

    if (!market?.coin) {
      throw new Error(`Market data failed: ${marketResult.reason?.message || "No fallback data"}`);
    }

    render(market.coin, chartData);
    renderOnchain({
      chart: annualChartResult.status === "fulfilled" ? annualChartResult.value : null,
      mvrv: mvrvResult.status === "fulfilled" ? mvrvResult.value : null,
      chartError:
        annualChartResult.status === "rejected" ? annualChartResult.reason.message : "",
      mvrvError: mvrvResult.status === "rejected" ? mvrvResult.reason.message : "",
    });
    renderSentiment({
      chart: annualChartResult.status === "fulfilled" ? annualChartResult.value : null,
      fearGreed: fearGreedResult.status === "fulfilled" ? fearGreedResult.value : null,
      fearGreedError:
        fearGreedResult.status === "rejected" ? fearGreedResult.reason.message : "",
    });
    updateStatus(
      "数据来自 CoinGecko、CryptoCompare、CoinPaprika、Kraken、Coinbase、Coin Metrics 与 Alternative.me；失败时使用本地缓存。页面每 60 秒自动刷新。",
    );
  } catch (error) {
    updateStatus(`更新失败：${error.message}`, true);
    drawEmptyChart();
    renderOnchainError(error.message);
    renderSentimentError(error.message);
  } finally {
    els.refresh.disabled = false;
  }
}

function render(coin, chart) {
  const marketCurrency = coin.currency || state.currency;
  const marketUpdatedAt = coin.last_updated || Date.now();
  state.latestSignals = {
    ...(state.latestSignals || {}),
    market: {
      currentPrice: coin.current_price,
      change24h: coin.price_change_percentage_24h,
      currency: marketCurrency,
    },
  };

  els.price.textContent = moneyFor(coin.current_price, marketCurrency);
  stampUpdated(els.price, marketUpdatedAt);
  setSigned(els.change24h, coin.price_change_percentage_24h);
  stampUpdated(els.change24h, marketUpdatedAt);
  els.lastUpdated.textContent = `最后更新：${dateTime(coin.last_updated)} · ${coin.source || "CoinGecko"}`;

  els.marketCap.textContent = moneyFor(coin.market_cap, marketCurrency, true, 3);
  els.volume.textContent = moneyFor(coin.total_volume, marketCurrency, true);
  els.high24h.textContent = moneyFor(coin.high_24h, marketCurrency);
  els.low24h.textContent = moneyFor(coin.low_24h, marketCurrency);
  stampUpdated(els.marketCap, marketUpdatedAt);
  stampUpdated(els.volume, marketUpdatedAt);
  stampUpdated(els.high24h, marketUpdatedAt);
  stampUpdated(els.low24h, marketUpdatedAt);

  setSigned(els.change1h, coin.price_change_percentage_1h_in_currency);
  setSigned(els.changeCard24h, coin.price_change_percentage_24h_in_currency);
  setSigned(els.change7d, coin.price_change_percentage_7d_in_currency);
  setSigned(els.change30d, coin.price_change_percentage_30d_in_currency);
  stampUpdated(els.change1h, marketUpdatedAt);
  stampUpdated(els.changeCard24h, marketUpdatedAt);
  stampUpdated(els.change7d, marketUpdatedAt);
  stampUpdated(els.change30d, marketUpdatedAt);

  els.ath.textContent = moneyFor(coin.ath, marketCurrency);
  stampUpdated(els.ath, marketUpdatedAt);
  els.athDate.textContent = dateTime(coin.ath_date);
  const athElapsedDays = daysSince(coin.ath_date);
  els.athDays.textContent = Number.isFinite(athElapsedDays)
    ? `距今 ${number(athElapsedDays, false)} 天`
    : "--";
  setSigned(els.athChange, coin.ath_change_percentage);
  stampUpdated(els.athChange, marketUpdatedAt);

  renderPriceChart(chart);
  renderRecommendation();
}

function renderPriceChart(result) {
  state.chartSeries = result?.series || [];
  state.chartCurrency = result?.currency || state.currency;
  state.chartSource = result?.source || "CoinGecko";
  state.hoverIndex = null;
  els.chartTooltip.hidden = true;
  els.chartRangeLabel.textContent = CHART_RANGES[state.chartDays] || `${state.chartDays} days`;

  if (state.chartSeries.length) {
    const first = state.chartSeries[0].price;
    const last = state.chartSeries[state.chartSeries.length - 1].price;
    const change = Number.isFinite(first) && first !== 0
      ? ((last - first) / first) * 100
      : null;
    const updatedAt = state.chartSeries[state.chartSeries.length - 1].time;
    const changeClass = change > 0 ? "up" : change < 0 ? "down" : "neutral";
    els.trendLabel.innerHTML = `
      <span class="chart-trend-prices">${chartMoney(first)} -> ${chartMoney(last)}</span>
      <strong class="chart-trend-change ${changeClass}">${percent(change)}</strong>
      <span class="chart-trend-updated">最后更新：${dateTime(updatedAt)}</span>
    `;
  } else {
    els.trendLabel.textContent = "--";
  }

  drawChart(state.chartSeries);
}

function cachedChartState() {
  if (!state.chartSeries.length) return null;
  return {
    series: state.chartSeries,
    source: `${state.chartSource} cached`,
    currency: state.chartCurrency,
  };
}

function parseChartSeries(chart) {
  return (chart?.prices || [])
    .map(([time, price]) => ({ time: Number(time), price: Number(price) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
}

function parseCoinbaseCandles(candles) {
  const points = (Array.isArray(candles) ? candles : [])
    .map(([time, low, high, open, close]) => ({
      time: Number(time) * 1000,
      price: Number(close ?? open ?? high ?? low),
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price))
    .sort((a, b) => a.time - b.time);
  return dedupeSeries(points);
}

function normalizeCryptoCompareMarket(payload, currency) {
  const row = payload?.RAW?.BTC?.[currency.toUpperCase()];
  if (!row) return null;

  return {
    current_price: Number(row.PRICE),
    market_cap: Number(row.MKTCAP || row.CIRCULATINGSUPPLYMKTCAP),
    total_volume: Number(row.TOTALVOLUME24HTO || row.VOLUME24HOURTO),
    high_24h: Number(row.HIGH24HOUR),
    low_24h: Number(row.LOW24HOUR),
    price_change_percentage_1h_in_currency: Number(row.CHANGEPCTHOUR),
    price_change_percentage_24h: Number(row.CHANGEPCT24HOUR),
    price_change_percentage_24h_in_currency: Number(row.CHANGEPCT24HOUR),
    price_change_percentage_7d_in_currency: null,
    price_change_percentage_30d_in_currency: null,
    ath: null,
    ath_date: null,
    ath_change_percentage: null,
    last_updated: row.LASTUPDATE ? Number(row.LASTUPDATE) * 1000 : Date.now(),
    currency,
    source: "CryptoCompare",
  };
}

function normalizeCoinPaprikaMarket(payload) {
  const quote = payload?.quotes?.USD;
  if (!quote) return null;

  return {
    current_price: Number(quote.price),
    market_cap: Number(quote.market_cap),
    total_volume: Number(quote.volume_24h),
    high_24h: null,
    low_24h: null,
    price_change_percentage_1h_in_currency: Number(quote.percent_change_1h),
    price_change_percentage_24h: Number(quote.percent_change_24h),
    price_change_percentage_24h_in_currency: Number(quote.percent_change_24h),
    price_change_percentage_7d_in_currency: Number(quote.percent_change_7d),
    price_change_percentage_30d_in_currency: Number(quote.percent_change_30d),
    ath: Number(quote.ath_price),
    ath_date: quote.ath_date,
    ath_change_percentage: Number(quote.percent_from_price_ath),
    last_updated: payload.last_updated || Date.now(),
    currency: "usd",
    source: "CoinPaprika",
  };
}

function normalizeKrakenMarket(payload) {
  const row = payload?.result?.XXBTZUSD || Object.values(payload?.result || {})[0];
  if (!row) return null;
  const price = Number(row.c?.[0]);
  const open24h = Number(row.o);
  const volumeBtc = Number(row.v?.[1]);
  const change24h = Number.isFinite(price) && Number.isFinite(open24h)
    ? ((price - open24h) / open24h) * 100
    : null;

  return {
    current_price: price,
    market_cap: null,
    total_volume: Number.isFinite(volumeBtc) && Number.isFinite(price) ? volumeBtc * price : null,
    high_24h: Number(row.h?.[1]),
    low_24h: Number(row.l?.[1]),
    price_change_percentage_1h_in_currency: null,
    price_change_percentage_24h: change24h,
    price_change_percentage_24h_in_currency: change24h,
    price_change_percentage_7d_in_currency: null,
    price_change_percentage_30d_in_currency: null,
    ath: null,
    ath_date: null,
    ath_change_percentage: null,
    last_updated: Date.now(),
    currency: "usd",
    source: "Kraken",
  };
}

function synthesizeMarketFromChart(chartResult) {
  const series = chartResult?.series || [];
  const latest = series[series.length - 1];
  if (!latest) return null;

  return {
    coin: {
      current_price: latest.price,
      market_cap: null,
      total_volume: null,
      high_24h: null,
      low_24h: null,
      price_change_percentage_1h_in_currency: null,
      price_change_percentage_24h: null,
      price_change_percentage_24h_in_currency: null,
      price_change_percentage_7d_in_currency: null,
      price_change_percentage_30d_in_currency: null,
      ath: null,
      ath_date: null,
      ath_change_percentage: null,
      last_updated: latest.time,
      currency: chartResult.currency || state.currency,
      source: `${chartResult.source} chart`,
    },
    source: `${chartResult.source} chart`,
  };
}

function parseCryptoCompareSeries(payload) {
  const points = (payload?.Data?.Data || [])
    .map((row) => ({
      time: Number(row.time) * 1000,
      price: Number(row.close),
    }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.price));
  return dedupeSeries(points);
}

function parseKrakenOhlc(payload, days) {
  const rows = payload?.result?.XXBTZUSD || Object.values(payload?.result || {}).find(Array.isArray);
  const cutoff = Date.now() - days * 86_400_000;
  const points = (Array.isArray(rows) ? rows : [])
    .map(([time, open, high, low, close]) => ({
      time: Number(time) * 1000,
      price: Number(close ?? open ?? high ?? low),
    }))
    .filter((point) => (
      Number.isFinite(point.time) &&
      Number.isFinite(point.price) &&
      point.time >= cutoff
    ));
  return dedupeSeries(points);
}

function dedupeSeries(series) {
  const byTime = new Map();
  series.forEach((point) => byTime.set(point.time, point));
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function renderOnchain({ chart, mvrv, chartError, mvrvError }) {
  const latestMvrv = readLatestMetric(mvrv, "CapMVRVCur");
  const latestPuell = estimatePuell(chart);
  const latestNupl = Number.isFinite(latestMvrv) ? 1 - 1 / latestMvrv : null;
  const sourceDate = readLatestTime(mvrv);
  const onchainUpdatedAt = sourceDate || Date.now();

  els.mvrv.textContent = ratio(latestMvrv);
  stampUpdated(els.mvrv, onchainUpdatedAt);
  window.BtcIndicatorUI.renderAxis(els.mvrvAxis, latestMvrv, window.BtcIndicatorUI.axes.mvrv);

  els.nupl.textContent = ratio(latestNupl, 3);
  stampUpdated(els.nupl, onchainUpdatedAt);
  window.BtcIndicatorUI.renderAxis(els.nuplAxis, latestNupl, window.BtcIndicatorUI.axes.nupl);

  els.puell.textContent = ratio(latestPuell);
  stampUpdated(els.puell, Date.now());
  window.BtcIndicatorUI.renderAxis(els.puellAxis, latestPuell, window.BtcIndicatorUI.axes.puell);

  els.onchainUpdated.textContent = sourceDate ? `链上数据：${dateTime(sourceDate)}` : "链上数据待更新";
  state.latestSignals = {
    ...(state.latestSignals || {}),
    onchain: { mvrv: latestMvrv, nupl: latestNupl, puell: latestPuell },
  };
  renderRecommendation();
}

function renderOnchainError(message) {
  els.nupl.textContent = "--";
  els.puell.textContent = "--";
  els.mvrv.textContent = "--";
  window.BtcIndicatorUI.renderAxis(els.nuplAxis, null, window.BtcIndicatorUI.axes.nupl);
  window.BtcIndicatorUI.renderAxis(els.puellAxis, null, window.BtcIndicatorUI.axes.puell);
  window.BtcIndicatorUI.renderAxis(els.mvrvAxis, null, window.BtcIndicatorUI.axes.mvrv);
  els.onchainUpdated.textContent = "链上数据待更新";
  state.latestSignals = {
    ...(state.latestSignals || {}),
    onchain: { mvrv: null, nupl: null, puell: null },
  };
  renderRecommendation();
}

function renderSentiment({ chart, fearGreed, fearGreedError }) {
  renderFearGreed(fearGreed, fearGreedError);
}

function renderSentimentError(message) {
  els.fearGreedValue.textContent = "--";
  els.fearGreedMeter.style.width = "0%";
  els.fearGreedLabel.textContent = "暂不可用";
  els.fearGreedDate.textContent = message;
  state.latestSignals = {
    ...(state.latestSignals || {}),
    sentiment: { fearGreed: null },
  };
  renderRecommendation();
}

function renderFearGreed(payload, error) {
  const row = payload?.data?.[0];
  const value = Number(row?.value);
  const updatedAt = row?.timestamp ? Number(row.timestamp) * 1000 : Date.now();
  if (!Number.isFinite(value)) {
    els.fearGreedValue.textContent = "--";
    els.fearGreedMeter.style.width = "0%";
    els.fearGreedLabel.textContent = `Fear & Greed 暂不可用${error ? `：${error}` : ""}`;
    els.fearGreedDate.textContent = "Alternative.me";
    return;
  }

  els.fearGreedValue.textContent = value.toFixed(0);
  stampUpdated(els.fearGreedValue, updatedAt);
  els.fearGreedMeter.style.width = `${Math.max(0, Math.min(value, 100))}%`;
  els.fearGreedLabel.textContent = row.value_classification || classifyFearGreed(value);
  els.fearGreedDate.textContent = row.timestamp
    ? `更新日期：${dateOnly(Number(row.timestamp) * 1000)}`
    : "Alternative.me";
  state.latestSignals = {
    ...(state.latestSignals || {}),
    sentiment: { fearGreed: value },
  };
  renderRecommendation();
}

function classifyFearGreed(value) {
  if (value <= 24) return "Extreme Fear";
  if (value <= 49) return "Fear";
  if (value <= 54) return "Neutral";
  if (value <= 74) return "Greed";
  return "Extreme Greed";
}

function latestChartPrice(chart) {
  const prices = chart?.prices || [];
  const last = prices[prices.length - 1];
  const value = Array.isArray(last) ? Number(last[1]) : NaN;
  return Number.isFinite(value) ? value : null;
}

function moneyUsd(value) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

async function sharePage() {
  const isLocalFile = window.location.protocol === "file:";
  const shareData = {
    title: "BTC Tracker",
    text: "Bitcoin price, market data, on-chain valuation, and sentiment.",
    url: window.location.href,
  };

  if (isLocalFile) {
    updateShareStatus("当前是本地文件链接。先部署到公网，再分享给别人。", true);
    return;
  }

  try {
    if (navigator.share) {
      await navigator.share(shareData);
      updateShareStatus("已打开系统分享面板。");
      return;
    }

    await copyText(shareData.url);
    updateShareStatus("公开链接已复制。");
  } catch (error) {
    if (error.name === "AbortError") {
      updateShareStatus("分享已取消。");
      return;
    }
    updateShareStatus("分享失败，请手动复制浏览器地址。", true);
  }
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function readLatestMetric(payload, metricName) {
  const row = payload?.data?.[0];
  const value = row ? Number(row[metricName]) : NaN;
  return Number.isFinite(value) ? value : null;
}

function readLatestTime(payload) {
  return payload?.data?.[0]?.time || "";
}

function estimatePuell(chart) {
  const prices = chart?.prices?.map(([, price]) => price).filter(Number.isFinite) || [];
  if (prices.length < 30) return null;
  const latestPrice = prices[prices.length - 1];
  const averagePrice = prices.reduce((total, price) => total + price, 0) / prices.length;
  return latestPrice / averagePrice;
}

function setupCanvas() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.canvas.width = Math.round(rect.width * dpr);
  els.canvas.height = Math.round(rect.height * dpr);
  const ctx = els.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}

function drawChart(series) {
  const { ctx, width, height } = setupCanvas();
  ctx.clearRect(0, 0, width, height);

  if (!series || series.length < 2) {
    state.chartCoords = [];
    state.chartPlot = null;
    drawEmptyChart();
    return;
  }

  const padding = { top: 20, right: 18, bottom: 48, left: 66 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const prices = series.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const rising = prices[prices.length - 1] >= prices[0];
  state.chartPlot = {
    left: padding.left,
    right: width - padding.right,
    top: padding.top,
    bottom: height - padding.bottom,
  };

  ctx.strokeStyle = "rgba(57, 255, 90, 0.22)";
  ctx.lineWidth = 1;
  ctx.fillStyle = "#89b48f";
  ctx.font = "700 12px Inter, system-ui, sans-serif";

  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + (chartHeight / 4) * i;
    const value = max - (range / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillText(chartMoney(value, true), 4, y + 4);
  }

  drawXAxis(ctx, series, padding, width, height);

  const coords = series.map((point, index) => {
    const x = padding.left + (chartWidth / (series.length - 1)) * index;
    const y = padding.top + chartHeight - ((point.price - min) / range) * chartHeight;
    return [x, y];
  });
  state.chartCoords = coords;

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
  gradient.addColorStop(0, "rgba(255, 122, 26, 0.28)");
  gradient.addColorStop(1, "rgba(7, 10, 7, 0)");

  ctx.beginPath();
  coords.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.lineTo(width - padding.right, height - padding.bottom);
  ctx.lineTo(padding.left, height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  coords.forEach(([x, y], index) => {
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#ff7a1a";
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const [lastX, lastY] = coords[coords.length - 1];
  ctx.beginPath();
  ctx.arc(lastX, lastY, 5, 0, Math.PI * 2);
  ctx.fillStyle = "#ff7a1a";
  ctx.fill();

  if (Number.isInteger(state.hoverIndex) && coords[state.hoverIndex]) {
    const [hoverX, hoverY] = coords[state.hoverIndex];
    ctx.beginPath();
    ctx.moveTo(hoverX, padding.top);
    ctx.lineTo(hoverX, height - padding.bottom);
    ctx.strokeStyle = "rgba(255, 122, 26, 0.42)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(hoverX, hoverY, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#071009";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ff7a1a";
    ctx.stroke();
  }
}

function drawEmptyChart() {
  const { ctx, width, height } = setupCanvas();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#89b48f";
  ctx.font = "800 16px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("暂无走势图数据", width / 2, height / 2);
  ctx.textAlign = "left";
}

function drawXAxis(ctx, series, padding, width, height) {
  const count = Math.min(series.length, width < 560 ? 4 : 6);
  const bottom = height - padding.bottom;
  const right = width - padding.right;
  const chartWidth = right - padding.left;

  ctx.save();
  ctx.strokeStyle = "rgba(57, 255, 90, 0.22)";
  ctx.fillStyle = "#89b48f";
  ctx.font = "700 11px Inter, system-ui, sans-serif";
  ctx.textBaseline = "top";

  for (let i = 0; i < count; i += 1) {
    const index = Math.round((series.length - 1) * (i / (count - 1 || 1)));
    const x = padding.left + chartWidth * (i / (count - 1 || 1));
    const label = formatAxisDate(series[index].time);

    ctx.beginPath();
    ctx.moveTo(x, bottom);
    ctx.lineTo(x, bottom + 5);
    ctx.stroke();

    ctx.textAlign = i === 0 ? "left" : i === count - 1 ? "right" : "center";
    ctx.fillText(label, x, bottom + 10);
  }

  ctx.restore();
}

function handleChartPointer(event) {
  if (!state.chartCoords.length) return;
  const rect = els.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const index = nearestChartIndex(x);
  showChartTooltip(index);
}

function handleChartTouch(event) {
  const touch = event.touches[0];
  if (!touch) return;
  handleChartPointer(touch);
}

function nearestChartIndex(x) {
  const plot = state.chartPlot;
  if (!plot) return null;
  const clampedX = Math.max(plot.left, Math.min(x, plot.right));
  const ratioX = (clampedX - plot.left) / (plot.right - plot.left || 1);
  return Math.max(0, Math.min(state.chartSeries.length - 1, Math.round(ratioX * (state.chartSeries.length - 1))));
}

function showChartTooltip(index) {
  if (!Number.isInteger(index) || !state.chartSeries[index] || !state.chartCoords[index]) return;
  state.hoverIndex = index;
  drawChart(state.chartSeries);

  const point = state.chartSeries[index];
  const [x, y] = state.chartCoords[index];
  els.chartTooltip.innerHTML = `<strong>${chartMoney(point.price)}</strong><span>${formatChartDate(point.time)}</span>`;
  els.chartTooltip.hidden = false;

  const tooltipWidth = els.chartTooltip.offsetWidth || 150;
  const left = Math.max(8, Math.min(x - tooltipWidth / 2, els.canvas.clientWidth - tooltipWidth - 8));
  const top = Math.max(8, y - 56);
  els.chartTooltip.style.left = `${left}px`;
  els.chartTooltip.style.top = `${top}px`;
}

function hideChartTooltip() {
  state.hoverIndex = null;
  els.chartTooltip.hidden = true;
  drawChart(state.chartSeries);
}

function formatChartDate(time) {
  return state.chartDays <= 1 ? `${formatDate(time)} ${formatTime(time)}` : formatDate(time);
}

function formatAxisDate(time) {
  return formatDate(time);
}

function setChartRange(days) {
  state.chartDays = days;
  state.hoverIndex = null;
  els.rangeTabs.forEach((tab) => {
    tab.classList.toggle("active", Number(tab.dataset.days) === days);
  });
  loadBitcoin();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function scoreLabel(score) {
  if (score >= 0.75) return "Strong bullish";
  if (score >= 0.2) return "Bullish";
  if (score > -0.2) return "Balanced";
  if (score > -0.75) return "Bearish";
  return "Strong bearish";
}

function confidenceLabel(level) {
  if (level >= 80) return "High";
  if (level >= 55) return "Medium";
  return "Low";
}

function buildRecommendation() {
  const market = state.latestSignals?.market || {};
  const onchain = state.latestSignals?.onchain || {};
  const sentiment = state.latestSignals?.sentiment || {};
  const powerLaw = state.powerLawSummary || {};
  const components = [];
  const reasons = [];

  if (Number.isFinite(sentiment.fearGreed)) {
    const score = clamp((50 - sentiment.fearGreed) / 35, -1, 1);
    components.push(score * 1.1);
    reasons.push(
      sentiment.fearGreed <= 30
        ? "Fear & Greed 偏低，市场情绪更接近恐惧区间"
        : sentiment.fearGreed >= 70
          ? "Fear & Greed 偏高，市场情绪更接近贪婪区间"
          : "Fear & Greed 处于中性附近"
    );
  }

  if (Number.isFinite(onchain.mvrv)) {
    const score = clamp((1.8 - onchain.mvrv) / 1.3, -1, 1);
    components.push(score * 1.2);
    reasons.push(
      onchain.mvrv < 1.4
        ? "MVRV 较低，估值压力不大"
        : onchain.mvrv > 2.6
          ? "MVRV 偏高，获利盘和回撤压力上升"
          : "MVRV 位于中性区间"
    );
  }

  if (Number.isFinite(onchain.nupl)) {
    const score = clamp((0.35 - onchain.nupl) / 0.35, -1, 1);
    components.push(score * 0.8);
    reasons.push(
      onchain.nupl < 0.25
        ? "NUPL 偏低，未实现利润水平不算拥挤"
        : onchain.nupl > 0.6
          ? "NUPL 偏高，市场更接近高盈利阶段"
          : "NUPL 没有给出极端信号"
    );
  }

  if (Number.isFinite(onchain.puell)) {
    const score = clamp((1.0 - onchain.puell) / 0.9, -1, 1);
    components.push(score * 0.7);
    reasons.push(
      onchain.puell < 0.75
        ? "Puell Multiple 偏低，历史上更接近低估区"
        : onchain.puell > 1.8
          ? "Puell Multiple 偏高，短期热度上行"
          : "Puell Multiple 处于常态范围"
    );
  }

  if (
    Number.isFinite(market.currentPrice) &&
    Number.isFinite(powerLaw.support) &&
    Number.isFinite(powerLaw.resistance)
  ) {
    const midpoint = (powerLaw.support + powerLaw.resistance) / 2;
    const halfRange = Math.max((powerLaw.resistance - powerLaw.support) / 2, 1);
    const score = clamp((midpoint - market.currentPrice) / halfRange, -1, 1);
    components.push(score * 1.35);
    reasons.push(
      market.currentPrice <= powerLaw.fit
        ? "现价位于 power law 拟合线附近或其下方"
        : "现价位于 power law 拟合线之上"
    );
  }

  if (Number.isFinite(market.change24h)) {
    const score = clamp((-market.change24h) / 12, -1, 1);
    components.push(score * 0.35);
    reasons.push(
      market.change24h <= -5
        ? "24h 出现明显回撤"
        : market.change24h >= 5
          ? "24h 涨幅较大，短线追高风险增加"
          : "24h 波动中性"
    );
  }

  const totalWeight = components.reduce((sum, value) => sum + Math.abs(value), 0);
  const averageScore = components.length
    ? components.reduce((sum, value) => sum + value, 0) / components.length
    : 0;
  let action = "HOLD";
  if (averageScore >= 0.3) action = "BUY";
  else if (averageScore <= -0.3) action = "SELL";

  const confidence = clamp(
    Math.round((Math.abs(averageScore) * 45 + components.length * 8) * 1.15),
    20,
    95,
  );

  return {
    action,
    confidence,
    tone: scoreLabel(averageScore),
    summary: reasons.slice(0, 3).join("；"),
  };
}

function renderRecommendation() {
  const recommendation = buildRecommendation();
  const badge = els.recommendationBadge;
  els.recommendationAction.textContent = recommendation.action;
  els.recommendationConfidence.textContent =
    `Confidence: ${confidenceLabel(recommendation.confidence)} (${recommendation.confidence}%)`;
  badge.textContent = recommendation.tone;
  badge.classList.remove("up", "down", "neutral");
  if (recommendation.action === "BUY") badge.classList.add("up");
  else if (recommendation.action === "SELL") badge.classList.add("down");
  else badge.classList.add("neutral");

  els.recommendationSummary.textContent = recommendation.summary
    ? `${recommendation.action} 倾向。${recommendation.summary}。`
    : "数据还不完整，当前更适合先持有并继续观察。";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

function formatForecastDate(value) {
  if (!value) return "Unknown date";
  return String(value).replaceAll("-", "/");
}

function decodeEntities(value = "") {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function stripTags(value = "") {
  return decodeEntities(String(value).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function classifyForecast(text) {
  const lower = String(text).toLowerCase();
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

function summarizeForecast(title, description) {
  const base = stripTags(description || title);
  const sentence = base.split(/(?<=[.!?])\s+/)[0] || stripTags(title);
  return sentence.length > 180 ? `${sentence.slice(0, 177).trim()}...` : sentence;
}

function isRelevantForecast(item) {
  const text = `${item.title} ${item.description}`.toLowerCase();
  return (
    /\b(bitcoin|btc)\b/.test(text) &&
    /\b(news|market|price|etf|fund|mining|miner|regulation|policy|reserve|treasury|company|exchange|rally|crash|record|inflow|outflow|adoption|strategy)\b/.test(text)
  );
}

function parseForecastRss(xmlText) {
  const xml = new DOMParser().parseFromString(xmlText, "application/xml");
  return [...xml.querySelectorAll("item")].map((item) => {
    const link = item.querySelector("link")?.textContent?.trim() || "";
    const source = item.querySelector("source")?.textContent?.trim() || (() => {
      try {
        return new URL(link).hostname.replace(/^www\./, "");
      } catch {
        return "Source";
      }
    })();
    const pubDate = item.querySelector("pubDate")?.textContent?.trim();
    const title = stripTags(item.querySelector("title")?.textContent || "");
    const description = stripTags(item.querySelector("description")?.textContent || "");
    return {
      title,
      description,
      url: link,
      source,
      date: pubDate ? new Date(pubDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    };
  });
}

function pickLiveForecasts(items) {
  const seenUrls = new Set();
  const sourceCounts = new Map();
  const selected = [];
  const sorted = items
    .filter(isRelevantForecast)
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  for (const item of sorted) {
    if (!item.url || seenUrls.has(item.url)) continue;
    const sourceKey = item.source.toLowerCase();
    if ((sourceCounts.get(sourceKey) || 0) >= 2) continue;
    seenUrls.add(item.url);
    sourceCounts.set(sourceKey, (sourceCounts.get(sourceKey) || 0) + 1);
    selected.push({
      date: item.date,
      source: item.source,
      url: item.url,
      summary: summarizeForecast(item.title, item.description),
      stance: classifyForecast(`${item.title} ${item.description}`),
    });
    if (selected.length >= 10) break;
  }

  return selected;
}

async function fetchTextWithFallback(url) {
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.text();
  } catch (error) {
    const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    const response = await fetch(proxy, { cache: "no-store" });
    if (!response.ok) throw error;
    return response.text();
  }
}

async function fetchLiveForecasts() {
  const queries = [
    "bitcoin OR BTC latest news when:7d",
    "bitcoin ETF OR BTC ETF news when:7d",
    "bitcoin market price news when:7d",
    "bitcoin regulation mining company news when:7d",
  ];
  const results = [];

  for (const query of queries) {
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");
    try {
      results.push(...parseForecastRss(await fetchTextWithFallback(url.toString())));
    } catch (error) {
      console.warn("Live forecast search failed", error);
    }
  }

  const forecasts = pickLiveForecasts(results);
  if (!forecasts.length) throw new Error("No fresh BTC news results found.");
  return {
    updatedAt: new Date().toISOString(),
    source: "Live Google News RSS",
    forecasts,
  };
}

function renderForecasts(payload) {
  const forecasts = Array.isArray(payload?.forecasts) ? payload.forecasts.slice(0, 10) : [];
  els.forecastUpdated.textContent = payload?.updatedAt
    ? `${payload.source?.startsWith("Live") ? "即时抓取" : "每日刷新"}：${dateTime(payload.updatedAt)}`
    : "每日刷新：等待数据";

  if (!forecasts.length) {
    els.forecastList.innerHTML = "<li>暂时没有抓取到新的 BTC 新闻。</li>";
    return;
  }

  els.forecastList.innerHTML = forecasts.map((item) => {
    const stance = ["bullish", "neutral", "bearish"].includes(item.stance)
      ? item.stance
      : "neutral";
    const label = stance.charAt(0).toUpperCase() + stance.slice(1);
    return `
      <li>
        <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">
          ${escapeHtml(formatForecastDate(item.date))} · ${escapeHtml(item.source || "Source")}
        </a>
        ${escapeHtml(item.summary || item.title || "BTC latest news")}
        <span class="forecast-tag forecast-${stance}">${label}</span>
      </li>
    `;
  }).join("");
}

async function loadForecasts() {
  try {
    const response = await fetch(`./forecasts.json?ts=${Date.now()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    renderForecasts(await response.json());
  } catch (error) {
    els.forecastUpdated.textContent = "每日刷新：暂不可用";
    els.forecastList.innerHTML = `<li>最新新闻加载失败：${escapeHtml(error.message)}</li>`;
  }
}

async function refreshForecastsNow() {
  els.forecastRefresh.disabled = true;
  els.forecastRefresh.textContent = "Refreshing...";
  els.forecastUpdated.textContent = "即时新闻：抓取中...";
  try {
    renderForecasts(await fetchLiveForecasts());
  } catch (error) {
    els.forecastUpdated.textContent = "即时新闻：失败，显示每日版本";
    await loadForecasts();
  } finally {
    els.forecastRefresh.disabled = false;
    els.forecastRefresh.textContent = "Refresh news";
  }
}

function renderWeeklySentiment(payload) {
  const counts = payload?.counts || {};
  const bullish = Number(counts.bullish) || 0;
  const neutral = Number(counts.neutral) || 0;
  const bearish = Number(counts.bearish) || 0;
  const total = Number(payload?.total) || bullish + neutral + bearish;

  els.weeklyBullish.textContent = total > 0 ? bullish : "--";
  els.weeklyNeutral.textContent = total > 0 ? neutral : "--";
  els.weeklyBearish.textContent = total > 0 ? bearish : "--";
  els.weeklySentimentUpdated.textContent = payload?.updatedAt
    ? `最近刷新：${dateTime(payload.updatedAt)}`
    : "最近刷新：等待数据";
  els.weeklySentimentTotal.textContent = total > 0
    ? `分析样本：${number(total, false)} 条新闻 · Bullish ${bullish} · Neutral ${neutral} · Bearish ${bearish}`
    : "等待首次每周新闻情绪分析。上传到 GitHub 后，可在 Actions 手动运行一次 Update Weekly BTC Sentiment。";
}

function pickSentimentItems(items) {
  const seen = new Set();
  return items
    .filter(isRelevantForecast)
    .filter((item) => {
      if (!item.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 100);
}

async function fetchLiveWeeklySentiment() {
  const queries = [
    "bitcoin OR BTC latest news when:7d",
    "bitcoin ETF OR BTC ETF news when:7d",
    "bitcoin market price news when:7d",
    "bitcoin regulation mining company news when:7d",
    "bitcoin adoption treasury exchange news when:7d",
  ];
  const results = [];

  for (const query of queries) {
    const url = new URL("https://news.google.com/rss/search");
    url.searchParams.set("q", query);
    url.searchParams.set("hl", "en-US");
    url.searchParams.set("gl", "US");
    url.searchParams.set("ceid", "US:en");
    try {
      results.push(...parseForecastRss(await fetchTextWithFallback(url.toString())));
    } catch (error) {
      console.warn("Live sentiment search failed", error);
    }
  }

  const items = pickSentimentItems(results);
  if (!items.length) throw new Error("No fresh BTC news results found for sentiment.");

  const counts = { bullish: 0, neutral: 0, bearish: 0 };
  items.forEach((item) => {
    counts[classifyForecast(`${item.title} ${item.description}`)] += 1;
  });

  return {
    updatedAt: new Date().toISOString(),
    source: "Live Google News RSS sentiment",
    total: items.length,
    counts,
  };
}

async function refreshWeeklySentimentNow() {
  els.weeklySentimentUpdated.textContent = "最近刷新：即时分析中...";
  try {
    renderWeeklySentiment(await fetchLiveWeeklySentiment());
  } catch (error) {
    els.weeklySentimentUpdated.textContent = "最近刷新：等待每周任务";
    els.weeklySentimentTotal.textContent =
      `即时新闻情绪分析失败：${error.message}。上传到 GitHub 后，可在 Actions 手动运行一次 Update Weekly BTC Sentiment。`;
  }
}

async function loadWeeklySentiment() {
  try {
    const response = await fetch(`./sentiment.json?ts=${Date.now()}`, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const payload = await response.json();
    renderWeeklySentiment(payload);
    if (!Number(payload?.total)) refreshWeeklySentimentNow();
  } catch (error) {
    els.weeklySentimentUpdated.textContent = "最近刷新：暂不可用";
    els.weeklySentimentTotal.textContent = `每周新闻情绪加载失败：${error.message}`;
  }
}

function refreshDashboard() {
  loadBitcoin();
  window.BtcPowerLaw.load();
  loadForecasts();
  loadWeeklySentiment();
}

window.BtcIndicatorUI.initialize({
  els,
  helpers: { ratio },
});

window.BtcPowerLaw.initialize({
  els,
  state,
  helpers: {
    cryptoCompareEndpoint,
    dedupeSeries,
    fetchJson,
    formatDate,
    marketChartEndpoint,
    moneyUsd,
    parseChartSeries,
    parseCryptoCompareSeries,
    readCache,
    writeCache,
  },
});

els.refresh.addEventListener("click", refreshDashboard);
els.share.addEventListener("click", sharePage);
els.forecastRefresh.addEventListener("click", refreshForecastsNow);
els.uiTheme.addEventListener("change", (event) => {
  applyUiTheme(event.target.value);
});
els.currency.addEventListener("change", (event) => {
  state.currency = event.target.value;
  loadBitcoin();
});
els.rangeTabs.forEach((tab) => {
  tab.addEventListener("click", () => setChartRange(Number(tab.dataset.days)));
});
els.canvas.addEventListener("mousemove", handleChartPointer);
els.canvas.addEventListener("click", handleChartPointer);
els.canvas.addEventListener("mouseleave", hideChartTooltip);
els.canvas.addEventListener("touchstart", handleChartTouch, { passive: true });
els.canvas.addEventListener("touchmove", handleChartTouch, { passive: true });

window.addEventListener("resize", () => {
  drawChart(state.chartSeries);
  window.BtcPowerLaw.resize();
});
window.addEventListener("btc-power-law-updated", renderRecommendation);

applyUiTheme(loadUiTheme());
loadBitcoin();
window.BtcPowerLaw.load();
loadForecasts();
refreshForecastsNow();
loadWeeklySentiment();
state.timer = window.setInterval(loadBitcoin, REFRESH_MS);
