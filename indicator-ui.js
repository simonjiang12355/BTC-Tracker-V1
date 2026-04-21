(function () {
  const axes = {
    nupl: {
      min: -0.25,
      max: 1,
      segments: [
        { from: -0.25, to: 0, label: "Bear bottom", comment: "Bear market bottom zone", color: "#d94b56" },
        { from: 0, to: 0.25, label: "Early bull", comment: "Early bull / late bear", color: "#f7931a" },
        { from: 0.25, to: 0.5, label: "Confidence", comment: "Market gaining confidence", color: "#12a182" },
        { from: 0.5, to: 0.75, label: "Strong bull", comment: "Strong bull, approaching greed", color: "#087c65" },
        { from: 0.75, to: 1, label: "Top risk", comment: "Historically aligns with tops", color: "#8d00a8" },
      ],
    },
    puell: {
      min: 0,
      max: 4,
      segments: [
        { from: 0, to: 0.5, label: "Oversold", comment: "Oversold, possible market bottom", color: "#12a182" },
        { from: 0.5, to: 2, label: "Neutral", comment: "Neutral, bull cycle in progress, not extreme", color: "#f7931a" },
        { from: 2, to: 3.5, label: "Overbought", comment: "Overbought, likely cycle peak", color: "#d94b56" },
        { from: 3.5, to: 4, label: "Peak risk", comment: "Overbought, likely cycle peak, especially elevated", color: "#8d00a8" },
      ],
    },
    mvrv: {
      min: 0,
      max: 4.5,
      segments: [
        { from: 0, to: 1, label: "Undervalued", comment: "BTC trading below cost basis, bottom undervalued zone", color: "#12a182" },
        { from: 1, to: 2, label: "Fair", comment: "Fair value or accumulation zone, neutral / early bull", color: "#087c65" },
        { from: 2, to: 2.5, label: "Elevated", comment: "Between fair value and elevated risk zone", color: "#f7931a" },
        { from: 2.5, to: 3.5, label: "Correction risk", comment: "Aggressive profit-taking zone, growing risk of correction", color: "#d94b56" },
        { from: 3.5, to: 4.5, label: "Cycle top risk", comment: "Euphoria, mass profit, unsustainable, cycle top likely", color: "#8d00a8" },
      ],
    },
  };

  const info = {
    nupl: {
      title: "NUPL",
      body: "Net Unrealized Profit/Loss measures the market's unrealized profit or loss. In this dashboard it is derived from MVRV as: NUPL = 1 - 1 / MVRV.",
    },
    puell: {
      title: "Puell Multiple",
      body: "Puell Multiple compares miner issuance value with its historical average. This dashboard uses an approximation: current BTC price / 365-day average BTC price.",
    },
    mvrv: {
      title: "MVRV Ratio",
      body: "Market Value to Realized Value compares BTC market capitalization with realized capitalization. This dashboard uses Coin Metrics CapMVRVCur.",
    },
  };

  const axisMap = new Map();
  let helpers = null;

  function axisPercent(value, config) {
    const clamped = Math.max(config.min, Math.min(value, config.max));
    return ((clamped - config.min) / (config.max - config.min)) * 100;
  }

  function formatAxisRange(from, to) {
    return `${helpers.ratio(from, 2)} - ${helpers.ratio(to, 2)}`;
  }

  function renderAxis(el, value, config) {
    if (!el) return;
    axisMap.set(el, config);
    const marker = Number.isFinite(value)
      ? `<span class="axis-marker" style="left: ${axisPercent(value, config)}%"></span>`
      : "";
    const valueLabel = Number.isFinite(value)
      ? `<span class="axis-current" style="left: ${axisPercent(value, config)}%">${helpers.ratio(value, 3)}</span>`
      : "";
    const segments = config.segments.map((segment) => {
      const left = axisPercent(segment.from, config);
      const width = axisPercent(segment.to, config) - left;
      return `
        <span
          class="axis-segment"
          data-from="${segment.from}"
          data-to="${segment.to}"
          data-label="${segment.comment || segment.label}"
          style="left: ${left}%; width: ${width}%; background: ${segment.color}"
        >
          <em>${segment.label}</em>
        </span>
      `;
    }).join("");

    el.innerHTML = `
      <div class="axis-track">${segments}${marker}${valueLabel}</div>
      <div class="axis-scale">
        <span>${helpers.ratio(config.min, 2)}</span>
        <span>${helpers.ratio(config.max, 2)}</span>
      </div>
    `;
  }

  function showAxisTooltip(axis, segment, text) {
    let tooltip = axis.querySelector(".axis-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "axis-tooltip";
      axis.append(tooltip);
    }
    tooltip.textContent = text;
    tooltip.hidden = false;
    const axisRect = axis.getBoundingClientRect();
    const segmentRect = segment.getBoundingClientRect();
    const tooltipWidth = tooltip.offsetWidth || 220;
    const left = Math.max(0, Math.min(
      segmentRect.left - axisRect.left + segmentRect.width / 2 - tooltipWidth / 2,
      axis.clientWidth - tooltipWidth,
    ));
    tooltip.style.left = `${left}px`;
  }

  function handleAxisPointer(event) {
    const segment = event.target.closest(".axis-segment");
    if (!segment) return;
    const axis = segment.closest(".indicator-axis");
    const config = axisMap.get(axis);
    if (!axis || !config) return;
    const from = Number(segment.dataset.from);
    const to = Number(segment.dataset.to);
    const label = segment.dataset.label || "";
    showAxisTooltip(axis, segment, `${label}: ${formatAxisRange(from, to)}`);
  }

  function hideAxisTooltip(event) {
    const tooltip = event.currentTarget.querySelector(".axis-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function showInfoTooltip(target, payload) {
    let tooltip = target.parentElement.querySelector(".info-tooltip");
    if (!tooltip) {
      tooltip = document.createElement("div");
      tooltip.className = "info-tooltip";
      target.parentElement.append(tooltip);
    }
    tooltip.innerHTML = `<strong>${payload.title}</strong><span>${payload.body}</span>`;
    tooltip.hidden = false;
  }

  function handleInfoPointer(event) {
    const payload = info[event.currentTarget.dataset.info];
    if (payload) showInfoTooltip(event.currentTarget, payload);
  }

  function hideInfoTooltip(event) {
    const tooltip = event.currentTarget.parentElement.querySelector(".info-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function initialize(options) {
    helpers = options.helpers;
    [options.els.nuplAxis, options.els.puellAxis, options.els.mvrvAxis].forEach((axis) => {
      axis.addEventListener("mousemove", handleAxisPointer);
      axis.addEventListener("click", handleAxisPointer);
      axis.addEventListener("mouseleave", hideAxisTooltip);
    });
    options.els.infoLinks.forEach((link) => {
      link.addEventListener("mouseenter", handleInfoPointer);
      link.addEventListener("focus", handleInfoPointer);
      link.addEventListener("click", handleInfoPointer);
      link.addEventListener("mouseleave", hideInfoTooltip);
      link.addEventListener("blur", hideInfoTooltip);
    });
  }

  window.BtcIndicatorUI = {
    axes,
    initialize,
    renderAxis,
  };
})();
