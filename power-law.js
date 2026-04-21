(function () {
  const BITCOIN_GENESIS_MS = Date.UTC(2009, 0, 3);
  const POWER_LAW_END_MS = Date.UTC(2040, 0, 1);
  let deps = null;

  function loadPowerLawChart() {
    return (async () => {
      try {
        deps.els.powerLawStatus.textContent = "正在加载 long term power law 数据...";
        const data = await fetchPowerLawData();
        deps.state.powerLaw = buildPowerLawModel(data);
        renderPowerLawSummary();
        drawPowerLawChart();
        const latestActual = deps.state.powerLaw.actual[deps.state.powerLaw.actual.length - 1];
        deps.els.powerLawStatus.textContent =
          `Power law 数据源：${deps.state.powerLaw.source} · 最后价格：${deps.helpers.moneyUsd(latestActual.price)}`;
      } catch (error) {
        deps.els.powerLawStatus.textContent = `Power law 加载失败：${error.message}`;
        renderPowerLawSummaryError();
        drawPowerLawEmpty();
      }
    })();
  }

  async function fetchPowerLawData() {
    try {
      const payload = await deps.helpers.fetchJson(deps.helpers.marketChartEndpoint("max", "usd"), {
        retries: 2,
        timeout: 18_000,
      });
      const series = deps.helpers.parseChartSeries(payload).filter((point) => point.price > 0);
      if (series.length >= 500) {
        const result = { series, source: "CoinGecko max" };
        deps.helpers.writeCache("power-law:max", result);
        return result;
      }
    } catch (error) {
      console.warn("CoinGecko max history failed, trying cached/fallback data", error);
    }

    const cached = deps.helpers.readCache("power-law:max");
    if (cached?.series?.length) return { ...cached, source: `${cached.source || "cached"} cached` };

    const series = await fetchCryptoCompareLongHistory();
    if (series.length < 500) throw new Error("No long-term history source returned enough data");
    const result = { series, source: "CryptoCompare long fallback" };
    deps.helpers.writeCache("power-law:max", result);
    return result;
  }

  async function fetchCryptoCompareLongHistory() {
    const chunks = [];
    let toTs = Math.floor(Date.now() / 1000);
    const earliest = Date.UTC(2011, 0, 1);
    for (let i = 0; i < 4; i += 1) {
      const payload = await deps.helpers.fetchJson(deps.helpers.cryptoCompareEndpoint(2000, "usd", toTs));
      const series = deps.helpers.parseCryptoCompareSeries(payload).filter((point) => point.price > 0);
      if (!series.length) break;
      chunks.push(...series);
      const oldest = series[0].time;
      if (oldest <= earliest) break;
      toTs = Math.floor(oldest / 1000) - 1;
    }
    return deps.helpers.dedupeSeries(chunks);
  }

  function buildPowerLawModel(data) {
    const actual = data.series
      .filter((point) => point.time > BITCOIN_GENESIS_MS && point.price > 0)
      .sort((a, b) => a.time - b.time);
    const regression = powerLawRegression(actual);
    const residuals = actual.map((point) => {
      const days = daysSinceGenesis(point.time);
      return Math.log(point.price) - powerLawLogValue(days, regression);
    }).sort((a, b) => a - b);
    const supportOffset = quantile(residuals, 0.05);
    const resistanceOffset = quantile(residuals, 0.95);
    const model = [];
    const start = actual[0]?.time || Date.UTC(2011, 0, 1);
    const step = 30 * 86_400_000;

    for (let time = start; time <= POWER_LAW_END_MS; time += step) {
      const values = powerLawValues(time, regression, supportOffset, resistanceOffset);
      if (values) model.push(values);
    }

    return {
      actual,
      model,
      regression,
      supportOffset,
      resistanceOffset,
      source: data.source,
      coords: {},
      plot: null,
    };
  }

  function renderPowerLawSummary() {
    const powerLaw = deps.state.powerLaw;
    if (!powerLaw) {
      renderPowerLawSummaryError();
      return;
    }

    const todayModel = powerLawValues(
      Date.now(),
      powerLaw.regression,
      powerLaw.supportOffset,
      powerLaw.resistanceOffset,
    );
    const latestActual = powerLaw.actual[powerLaw.actual.length - 1] || null;

    deps.els.powerLawPrice.textContent = latestActual
      ? deps.helpers.moneyUsd(latestActual.price)
      : "--";
    deps.els.powerLawPriceDate.textContent = latestActual
      ? `最新收盘：${deps.helpers.formatDate(latestActual.time)}`
      : "--";

    deps.els.powerLawResistance.textContent = todayModel
      ? deps.helpers.moneyUsd(todayModel.resistance)
      : "--";
    deps.els.powerLawModelDate.textContent = todayModel
      ? `模型日期：${deps.helpers.formatDate(todayModel.time)}`
      : "--";
    deps.els.powerLawFit.textContent = todayModel
      ? deps.helpers.moneyUsd(todayModel.fit)
      : "--";
    deps.els.powerLawSupport.textContent = todayModel
      ? deps.helpers.moneyUsd(todayModel.support)
      : "--";
    deps.state.powerLawSummary = {
      time: todayModel?.time ?? null,
      fit: todayModel?.fit ?? null,
      support: todayModel?.support ?? null,
      resistance: todayModel?.resistance ?? null,
      actualPrice: latestActual?.price ?? null,
      actualTime: latestActual?.time ?? null,
    };
    window.dispatchEvent(new CustomEvent("btc-power-law-updated"));
  }

  function renderPowerLawSummaryError() {
    deps.els.powerLawPrice.textContent = "--";
    deps.els.powerLawPriceDate.textContent = "--";
    deps.els.powerLawResistance.textContent = "--";
    deps.els.powerLawModelDate.textContent = "--";
    deps.els.powerLawFit.textContent = "--";
    deps.els.powerLawSupport.textContent = "--";
    deps.state.powerLawSummary = null;
    window.dispatchEvent(new CustomEvent("btc-power-law-updated"));
  }

  function powerLawRegression(series) {
    const points = series.map((point) => ({
      x: Math.log(daysSinceGenesis(point.time)),
      y: Math.log(point.price),
    }));
    const n = points.length;
    const sumX = points.reduce((t, p) => t + p.x, 0);
    const sumY = points.reduce((t, p) => t + p.y, 0);
    const sumXX = points.reduce((t, p) => t + p.x * p.x, 0);
    const sumXY = points.reduce((t, p) => t + p.x * p.y, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    return { slope, intercept };
  }

  function powerLawLogValue(days, regression) {
    return regression.intercept + regression.slope * Math.log(days);
  }

  function powerLawValues(time, regression, supportOffset, resistanceOffset) {
    const days = daysSinceGenesis(time);
    if (days <= 0) return null;
    const fitLog = powerLawLogValue(days, regression);
    return {
      time,
      fit: Math.exp(fitLog),
      support: Math.exp(fitLog + supportOffset),
      resistance: Math.exp(fitLog + resistanceOffset),
    };
  }

  function daysSinceGenesis(time) {
    return Math.max(1, (time - BITCOIN_GENESIS_MS) / 86_400_000);
  }

  function quantile(values, q) {
    if (!values.length) return 0;
    const index = (values.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return values[lower];
    return values[lower] + (values[upper] - values[lower]) * (index - lower);
  }

  function setupCanvas() {
    const rect = deps.els.powerLawCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    deps.els.powerLawCanvas.width = Math.round(rect.width * dpr);
    deps.els.powerLawCanvas.height = Math.round(rect.height * dpr);
    const ctx = deps.els.powerLawCanvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  function drawPowerLawChart() {
    if (!deps.state.powerLaw) return;
    const { ctx, width, height } = setupCanvas();
    const padding = { top: 32, right: 24, bottom: 50, left: 76 };
    const plot = { left: padding.left, right: width - padding.right, top: padding.top, bottom: height - padding.bottom };
    const allValues = [
      ...deps.state.powerLaw.actual.map((point) => point.price),
      ...deps.state.powerLaw.model.flatMap((point) => [point.support, point.fit, point.resistance]),
    ].filter((value) => Number.isFinite(value) && value > 0);
    const minLog = Math.floor(Math.log10(Math.min(...allValues)));
    const maxLog = Math.ceil(Math.log10(Math.max(...allValues)));
    const startTime = deps.state.powerLaw.actual[0].time;
    const endTime = POWER_LAW_END_MS;
    deps.state.powerLaw.plot = { ...plot, startTime, endTime, minLog, maxLog };

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawGrid(ctx, plot, width, height, minLog, maxLog, startTime, endTime);

    const mapPoint = (time, value) => [
      plot.left + ((time - startTime) / (endTime - startTime)) * (plot.right - plot.left),
      plot.bottom - ((Math.log10(value) - minLog) / (maxLog - minLog)) * (plot.bottom - plot.top),
    ];
    deps.state.powerLaw.coords = {
      actual: deps.state.powerLaw.actual.map((point) => ({ ...point, xy: mapPoint(point.time, point.price) })),
      model: deps.state.powerLaw.model.map((point) => ({
        ...point,
        resistanceXY: mapPoint(point.time, point.resistance),
        fitXY: mapPoint(point.time, point.fit),
        supportXY: mapPoint(point.time, point.support),
      })),
    };

    drawLine(ctx, deps.state.powerLaw.coords.model.map((point) => point.resistanceXY), "#8d00a8", 2);
    drawLine(ctx, deps.state.powerLaw.coords.model.map((point) => point.fitXY), "#007f00", 2);
    drawLine(ctx, deps.state.powerLaw.coords.model.map((point) => point.supportXY), "#e00000", 2);
    drawLine(ctx, deps.state.powerLaw.coords.actual.map((point) => point.xy), "#f0aa00", 2.4);
    drawLegend(ctx, width, height);
    drawHover(ctx, plot);
  }

  function drawGrid(ctx, plot, width, height, minLog, maxLog, startTime, endTime) {
    ctx.strokeStyle = "rgba(21, 23, 23, 0.16)";
    ctx.fillStyle = "#151717";
    ctx.font = "700 12px Inter, system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (let power = minLog; power <= maxLog; power += 1) {
      const value = 10 ** power;
      const y = plot.bottom - ((power - minLog) / (maxLog - minLog)) * (plot.bottom - plot.top);
      ctx.beginPath();
      ctx.moveTo(plot.left, y);
      ctx.lineTo(plot.right, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(compactUsd(value), plot.left - 10, y);
    }
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (let year = 2011; year <= 2040; year += width < 760 ? 4 : 2) {
      const time = Date.UTC(year, 0, 1);
      const x = plot.left + ((time - startTime) / (endTime - startTime)) * (plot.right - plot.left);
      ctx.beginPath();
      ctx.moveTo(x, plot.top);
      ctx.lineTo(x, plot.bottom);
      ctx.stroke();
      ctx.fillText(String(year), x, plot.bottom + 12);
    }
    ctx.save();
    ctx.translate(18, (plot.top + plot.bottom) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#65716d";
    ctx.fillText("USD", 0, 0);
    ctx.restore();
  }

  function drawLine(ctx, coords, color, width) {
    ctx.beginPath();
    coords.forEach(([x, y], index) => {
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function drawLegend(ctx, width, height) {
    const items = [
      ["Price end of day", "#f0aa00"],
      ["Resistance", "#8d00a8"],
      ["Linear regression fit", "#007f00"],
      ["Support", "#e00000"],
    ];
    const boxWidth = 235;
    const boxHeight = 104;
    const x = width - boxWidth - 28;
    const y = height - boxHeight - 66;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.strokeStyle = "rgba(21, 23, 23, 0.18)";
    ctx.fillRect(x, y, boxWidth, boxHeight);
    ctx.strokeRect(x, y, boxWidth, boxHeight);
    ctx.font = "700 13px Inter, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    items.forEach(([label, color], index) => {
      const rowY = y + 20 + index * 22;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + 14, rowY);
      ctx.lineTo(x + 42, rowY);
      ctx.stroke();
      ctx.fillStyle = "#151717";
      ctx.fillText(label, x + 52, rowY);
    });
  }

  function drawHover(ctx, plot) {
    if (!deps.state.powerLawHover) return;
    const { x, model, actual } = deps.state.powerLawHover;
    ctx.beginPath();
    ctx.moveTo(x, plot.top);
    ctx.lineTo(x, plot.bottom);
    ctx.strokeStyle = "rgba(21, 23, 23, 0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    [model.resistanceXY, model.fitXY, model.supportXY].forEach((xy) => {
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
    });
    if (actual?.xy) {
      ctx.beginPath();
      ctx.arc(actual.xy[0], actual.xy[1], 4.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f0aa00";
      ctx.fill();
    }
  }

  function drawPowerLawEmpty() {
    const { ctx, width, height } = setupCanvas();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#151717";
    ctx.font = "800 16px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("暂无 Power Law 数据", width / 2, height / 2);
  }

  function compactUsd(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: value >= 1000 ? "compact" : "standard",
      maximumFractionDigits: value >= 1000 ? 1 : 0,
    }).format(value);
  }

  function nearestModel(x) {
    return deps.state.powerLaw.coords.model.reduce((best, point) => {
      const distance = Math.abs(point.fitXY[0] - x);
      return !best || distance < best.distance ? { ...point, distance } : best;
    }, null);
  }

  function nearestActual(time) {
    const actual = deps.state.powerLaw.coords.actual;
    if (!actual.length || time > actual[actual.length - 1].time) return null;
    return actual.reduce((best, point) => {
      const distance = Math.abs(point.time - time);
      return !best || distance < best.distance ? { ...point, distance } : best;
    }, null);
  }

  function showTooltip(model, actual) {
    const tooltip = deps.els.powerLawTooltip;
    tooltip.innerHTML = `
      <strong>${deps.helpers.formatDate(model.time)}</strong>
      <span><b>Resistance</b>${deps.helpers.moneyUsd(model.resistance)}</span>
      <span><b>Linear regression fit</b>${deps.helpers.moneyUsd(model.fit)}</span>
      <span><b>Price end of day</b>${actual ? deps.helpers.moneyUsd(actual.price) : "--"}</span>
      <span><b>Support</b>${deps.helpers.moneyUsd(model.support)}</span>
    `;
    tooltip.hidden = false;
    const width = tooltip.offsetWidth || 230;
    const height = tooltip.offsetHeight || 132;
    const canvasWidth = deps.els.powerLawCanvas.clientWidth;
    const canvasHeight = deps.els.powerLawCanvas.clientHeight;
    const left = Math.max(8, Math.min(model.fitXY[0] + 14, canvasWidth - width - 8));
    const top = Math.max(8, Math.min(model.fitXY[1] - height / 2, canvasHeight - height - 8));
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function handlePointer(event) {
    if (!deps.state.powerLaw?.coords?.model?.length) return;
    const rect = deps.els.powerLawCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const model = nearestModel(x);
    if (!model) return;
    const actual = nearestActual(model.time);
    deps.state.powerLawHover = { x: model.fitXY[0], model, actual };
    drawPowerLawChart();
    showTooltip(model, actual);
  }

  function handleTouch(event) {
    const touch = event.touches[0];
    if (touch) handlePointer(touch);
  }

  function hideTooltip() {
    deps.state.powerLawHover = null;
    deps.els.powerLawTooltip.hidden = true;
    drawPowerLawChart();
  }

  function initialize(options) {
    deps = options;
    deps.els.powerLawCanvas.addEventListener("mousemove", handlePointer);
    deps.els.powerLawCanvas.addEventListener("click", handlePointer);
    deps.els.powerLawCanvas.addEventListener("mouseleave", hideTooltip);
    deps.els.powerLawCanvas.addEventListener("touchstart", handleTouch, { passive: true });
    deps.els.powerLawCanvas.addEventListener("touchmove", handleTouch, { passive: true });
  }

  window.BtcPowerLaw = {
    initialize,
    load: loadPowerLawChart,
    resize: drawPowerLawChart,
  };
})();
