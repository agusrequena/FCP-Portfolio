(function(){
  const SOURCE = window.SITE_DATA || {};
  const APP = SOURCE.APP || {};
  const DOCS = SOURCE.DOCS || [];
  const HUMAN = SOURCE.HUMAN || {};
  const INTERNAL = SOURCE.INTERNAL || {};
  const LEVERAGE = SOURCE.LEVERAGE || { snapshot:{}, series:{} };

  const ENTITY_OVERRIDES = {
    "Atlas Air": { domain:"atlasairworldwide.com" },
    "Cengage": { domain:"cengagegroup.com" },
    "Regional Express Holdings": { domain:"rex.com.au", quoteTicker:"REX.AX" },
    "Safe Fertility Group": { domain:"safefertilitygroup.com", quoteTicker:"SAFE.BK", status:"public" },
    "Genesis Fertility": { domain:"genesisfertility.com" },
    "Alpha IVF Group Berhad": { domain:"alphaivfgroup.com", quoteTicker:"0303.KL", status:"public" },
    "Hargreaves Lansdown": { quoteTicker:"HLL.L" },
    "Froy": { domain:"froy.no" },
    "BASF Coatings": { domain:"basf-coatings.com" },
    "Bold Production Services": { domain:"bps-llc.com" }
  };

  const PAGE = document.body.dataset.page;
  const PORTFOLIO = enrichPortfolio(SOURCE.PORTFOLIO || []);
  const PORTFOLIO_MAP = new Map(PORTFOLIO.map(company => [company.id, company]));
  let peerMarketPromise = null;

  const fmt1 = new Intl.NumberFormat("en-US",{ minimumFractionDigits:1, maximumFractionDigits:1 });
  const fmtPct = new Intl.NumberFormat("en-US",{ style:"percent", minimumFractionDigits:1, maximumFractionDigits:1 });

  document.addEventListener("DOMContentLoaded", () => {
    if(PAGE === "home") initHome();
    if(PAGE === "company") initCompany();
    if(PAGE === "peers") initPeers();
  });

  function enrichPortfolio(list){
    return list.map(company => {
      const companyOverride = ENTITY_OVERRIDES[company.name] || {};
      return {
        ...company,
        domain: company.domain || companyOverride.domain || null,
        groups: (company.groups || []).map(group => ({
          ...group,
          peers: (group.peers || []).map(peer => {
            const peerOverride = ENTITY_OVERRIDES[peer.name] || {};
            return {
              ...peer,
              domain: peer.domain || peerOverride.domain || null,
              quoteTicker: peerOverride.quoteTicker || peer.ticker || null,
              status: peerOverride.status || peer.status || "public"
            };
          })
        }))
      };
    });
  }

  function loadPeerMarket(){
    if(!peerMarketPromise){
      peerMarketPromise = fetch("peer-market-data.json")
        .then(res => res.ok ? res.json() : {})
        .catch(() => ({}));
    }
    return peerMarketPromise;
  }

  function byId(id){ return PORTFOLIO_MAP.get(id) || PORTFOLIO[0]; }
  function initials(name){ return String(name || "FCP").split(/\s+/).filter(Boolean).slice(0,2).map(part => part[0].toUpperCase()).join(""); }
  function brandImage(domain){ return domain ? `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(domain)}` : ""; }
  function mark(entity, cls = "brandMark"){
    const src = brandImage(entity.domain);
    return src
      ? `<div class="${cls}"><img src="${src}" alt="${escapeHtml(entity.name || entity.short || "brand")} logo" onerror="this.style.display='none';this.nextElementSibling.hidden=false"><span hidden>${escapeHtml(initials(entity.name || entity.short || entity.fund))}</span></div>`
      : `<div class="${cls}"><span>${escapeHtml(initials(entity.name || entity.short || entity.fund))}</span></div>`;
  }
  function escapeHtml(value){
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }
  function formatCompact(value){
    if(!Number.isFinite(value)) return "Data unavailable";
    const abs = Math.abs(value);
    if(abs >= 1e9) return `${fmt1.format(value / 1e9)}bn`;
    if(abs >= 1e6) return `${fmt1.format(value / 1e6)}m`;
    if(abs >= 1e3) return `${fmt1.format(value / 1e3)}k`;
    return fmt1.format(value);
  }
  function formatMultiple(value){ return Number.isFinite(value) ? `${fmt1.format(value)}x` : "Data unavailable"; }
  function formatPercent(value){ return Number.isFinite(value) ? fmtPct.format(value) : "Data unavailable"; }
  function formatMetric(metric, value){
    if(metric === "Valuation Mark") return formatMultiple(value);
    if(metric === "EBITDA margin" || metric === "Equity/EV") return formatPercent(value);
    return formatCompact(value);
  }
  function getMetricKeys(company){ return Object.keys(INTERNAL[company.internal] || {}); }
  function defaultMetric(company){
    const keys = getMetricKeys(company);
    if(keys.includes("EBITDA")) return "EBITDA";
    return keys[0] || null;
  }
  function latestPoint(company, metric){
    const series = INTERNAL[company.internal]?.[metric];
    if(!series) return null;
    const items = Object.entries(series).filter(([,value]) => Number.isFinite(value));
    return items.length ? { label: items[items.length - 1][0], value: items[items.length - 1][1] } : null;
  }
  function leverageSnapshot(company){ return LEVERAGE.snapshot?.[company.lev] || null; }
  function entryMultiple(company){
    if(Number.isFinite(company.entryMultiple)) return company.entryMultiple;
    const snapshot = leverageSnapshot(company);
    return snapshot && Number.isFinite(snapshot.entryMultiple) ? snapshot.entryMultiple : null;
  }
  function statusLabel(peer){
    const map = { public:"Public", private:"Private", delisted:"Delisted", "needs-verification":"Needs verification" };
    return map[peer.status] || "Unavailable";
  }
  function statusClass(change){
    if(!Number.isFinite(change)) return "flat";
    if(change > 0.01) return "up";
    if(change < -0.01) return "down";
    return "flat";
  }
  function emptyState(title, message){
    return `<div class="emptyState"><strong>${escapeHtml(title)}</strong><div class="small" style="margin-top:6px">${escapeHtml(message)}</div></div>`;
  }
  function peerSnapshot(peer, market){
    if(!peer) return null;
    return market?.[peer.quoteTicker || peer.ticker || ""] || null;
  }
  function companyLivePeers(company, market){
    return (company.groups || []).flatMap(group => group.peers || []).filter(peer => peerSnapshot(peer, market)?.ok);
  }
  function asOfDate(market){
    const values = Object.values(market || {}).filter(item => item && item.ok && item.fetchedAt);
    return values.length ? values[0].fetchedAt : APP.generatedOn || "Needs verification";
  }
  function normalizedSeries(points){
    if(!Array.isArray(points) || points.length < 2) return [];
    const base = points.find(point => Number.isFinite(point.close));
    if(!base || !base.close) return [];
    return points.filter(point => Number.isFinite(point.close)).map(point => ({
      date: point.date,
      value: (point.close / base.close) * 100
    }));
  }
  function latestSummaryMetric(company){
    const keys = getMetricKeys(company);
    const order = ["Valuation Mark","EBITDA","AUM","EBITDA margin","Equity/EV"];
    const selected = order.find(metric => keys.includes(metric)) || keys[0];
    if(!selected) return null;
    return { metric:selected, point:latestPoint(company, selected) };
  }

  function initHome(){
    loadPeerMarket().then(market => {
      renderHomeStats(market);
      renderHomeSections(market);
      bindHomeFilters();
    });
  }

  function renderHomeStats(market){
    const totalPeers = PORTFOLIO.reduce((sum, company) => sum + (company.groups || []).reduce((acc, group) => acc + (group.peers || []).length, 0), 0);
    const liveSnapshots = Object.values(market || {}).filter(item => item && item.ok).length;
    const workbookCompanies = PORTFOLIO.filter(company => getMetricKeys(company).length).length;
    const target = document.getElementById("heroStats");
    if(!target) return;
    target.innerHTML = `
      <div class="card statCard"><div class="eyebrow">Portfolio</div><div class="value">${PORTFOLIO.length}</div><div class="muted small">Companies in scope.</div></div>
      <div class="card statCard"><div class="eyebrow">Internal Coverage</div><div class="value">${workbookCompanies}</div><div class="muted small">Companies with extracted workbook metrics.</div></div>
      <div class="card statCard"><div class="eyebrow">Peer Universe</div><div class="value">${totalPeers}</div><div class="muted small">Configured public, private and legacy comparables.</div></div>
      <div class="card statCard"><div class="eyebrow">Live Snapshots</div><div class="value">${liveSnapshots}</div><div class="muted small">Public peer quotes rendered from Yahoo Finance snapshots.</div></div>
    `;

    const note = document.getElementById("sourceStatus");
    if(note){
      note.innerHTML = `
        <div class="sourceNote">
          <div class="eyebrow">Source Discipline</div>
          <div class="small">Internal operating and leverage data: <strong>${escapeHtml(APP.workbookDate || "Needs verification")}</strong> workbook extraction.</div>
          <div class="small">Public peer snapshot source: <strong>Yahoo Finance chart endpoint</strong>, baked into this static site as of <strong>${escapeHtml(asOfDate(market))}</strong>.</div>
          <div class="small">Brand marks use official domains via Google favicon service to keep the static Pages build stable.</div>
        </div>
      `;
    }
  }

  function renderHomeSections(market){
    const pre = PORTFOLIO.filter(company => company.era === "pre");
    const quantic = PORTFOLIO.filter(company => company.era === "quantic");
    const preTarget = document.getElementById("preCompanies");
    const quanticTarget = document.getElementById("quanticCompanies");
    if(preTarget) preTarget.innerHTML = pre.map(company => homeCompanyCard(company, market)).join("");
    if(quanticTarget) quanticTarget.innerHTML = quantic.map(company => homeCompanyCard(company, market)).join("");
  }

  function homeCompanyCard(company, market){
    const metric = latestSummaryMetric(company);
    const markPoint = latestPoint(company, "Valuation Mark");
    const peers = companyLivePeers(company, market);
    const leverage = leverageSnapshot(company);
    return `
      <article class="companyCard homeCompany" data-era="${company.era}" style="--accent:${company.color}">
        <div class="companyTop">
          ${mark(company)}
          <div>
            <div class="tagRow">
              <span class="badge">${escapeHtml(company.fund)}</span>
              <span class="badge">${company.era === "pre" ? "Pre-Quantic" : "FCP-Quantic"}</span>
              <span class="badge">${escapeHtml(company.basis)}</span>
            </div>
            <h3 class="companyName">${escapeHtml(company.name)}</h3>
            <div class="companyMeta">${escapeHtml(company.desc)}</div>
          </div>
        </div>
        <div class="kpiRow">
          <div class="miniMetric">
            <div class="label">Entry</div>
            <div class="value">${company.entryDate === "Data unavailable" ? "Needs verification" : escapeHtml(company.entryDate)}</div>
          </div>
          <div class="miniMetric">
            <div class="label">Entry Multiple</div>
            <div class="value">${formatMultiple(entryMultiple(company))}</div>
          </div>
          <div class="miniMetric">
            <div class="label">${escapeHtml(metric?.metric || "Latest internal")}</div>
            <div class="value">${metric ? formatMetric(metric.metric, metric.point?.value) : "Data unavailable"}</div>
          </div>
        </div>
        <div class="kpiRow">
          <div class="miniMetric">
            <div class="label">Valuation Mark</div>
            <div class="value">${markPoint ? formatMultiple(markPoint.value) : "Data unavailable"}</div>
          </div>
          <div class="miniMetric">
            <div class="label">Leverage</div>
            <div class="value">${Number.isFinite(leverage?.currentLeverage) ? formatMultiple(leverage.currentLeverage) : "Data unavailable"}</div>
          </div>
          <div class="miniMetric">
            <div class="label">Peers with market data</div>
            <div class="value">${peers.length}</div>
          </div>
        </div>
        <div class="inlineActions">
          <a class="btn" href="company.html?id=${encodeURIComponent(company.id)}">Open company page</a>
          <a class="btn secondary" href="peers.html?company=${encodeURIComponent(company.id)}">View peers</a>
        </div>
      </article>
    `;
  }

  function bindHomeFilters(){
    const buttons = Array.from(document.querySelectorAll("[data-filter-era]"));
    if(!buttons.length) return;
    buttons.forEach(button => button.addEventListener("click", () => {
      const value = button.dataset.filterEra;
      buttons.forEach(item => item.classList.toggle("active", item === button));
      document.querySelectorAll(".homeCompany").forEach(card => {
        card.hidden = value !== "all" && card.dataset.era !== value;
      });
    }));
  }

  function initCompany(){
    loadPeerMarket().then(market => {
      const params = new URLSearchParams(window.location.search);
      const company = byId(params.get("id") || PORTFOLIO[0]?.id);
      if(!company) return;
      renderCompanyPage(company, market);
    });
  }

  function renderCompanyPage(company, market){
    document.title = `${company.name} | FCP Portfolio Intelligence`;
    const hero = document.getElementById("companyHero");
    const nav = document.getElementById("companyNav");
    const dataroom = document.getElementById("companyDocs");
    const notes = document.getElementById("companyNotes");
    const peerGroups = document.getElementById("peerGroups");
    const state = { metric: defaultMetric(company), group:0 };

    if(nav){
      nav.innerHTML = PORTFOLIO.map(item => `<a href="company.html?id=${encodeURIComponent(item.id)}"${item.id === company.id ? ` style="border-color:${company.color};background:rgba(31,94,255,.08)"` : ""}>${escapeHtml(item.fund)} | ${escapeHtml(item.name)}</a>`).join("");
    }

    if(hero){
      const summaryMetric = latestSummaryMetric(company);
      const livePeers = companyLivePeers(company, market).length;
      const lev = leverageSnapshot(company);
      hero.innerHTML = `
        <div class="heroCard">
          <div class="companyHeader">
            ${mark(company)}
            <div>
              <div class="tagRow">
                <span class="badge">${escapeHtml(company.fund)}</span>
                <span class="badge">${company.era === "pre" ? "Pre-Quantic" : "FCP-Quantic"}</span>
                <span class="badge">${escapeHtml(company.basis)}</span>
              </div>
              <h1>${escapeHtml(company.name)}</h1>
              <p class="lead" style="margin:10px 0 0">${escapeHtml(company.desc)}</p>
            </div>
            <div class="inlineActions">
              <a class="btn secondary" href="index.html">Back to portfolio</a>
              <a class="btn" href="${escapeHtml(company.site)}" target="_blank" rel="noreferrer">Company site</a>
            </div>
          </div>
          <div class="stats">
            <div class="card miniMetric"><div class="label">Entry Date</div><div class="value">${company.entryDate === "Data unavailable" ? "Needs verification" : escapeHtml(company.entryDate)}</div></div>
            <div class="card miniMetric"><div class="label">Entry Multiple</div><div class="value">${formatMultiple(entryMultiple(company))}</div></div>
            <div class="card miniMetric"><div class="label">${escapeHtml(summaryMetric?.metric || "Latest internal")}</div><div class="value">${summaryMetric ? formatMetric(summaryMetric.metric, summaryMetric.point?.value) : "Data unavailable"}</div></div>
            <div class="card miniMetric"><div class="label">Live peer snapshots</div><div class="value">${livePeers}</div></div>
          </div>
          <div class="divider"></div>
          <div class="quickNav">
            <span class="chip">Leverage: ${Number.isFinite(lev?.currentLeverage) ? formatMultiple(lev.currentLeverage) : "Data unavailable"}</span>
            <span class="chip">Source date: ${escapeHtml(asOfDate(market))}</span>
            <a class="chip" href="peers.html?company=${encodeURIComponent(company.id)}">Open peer monitor</a>
          </div>
        </div>
      `;
    }

    if(dataroom){
      dataroom.innerHTML = DOCS.map(([key,title]) => `
        <article class="docCard">
          <div class="peerCard" style="grid-template-columns:44px minmax(0,1fr)">
            <div class="docAvatar">${escapeHtml(key.slice(0,2).toUpperCase())}</div>
            <div>
              <h3 class="docTitle">${escapeHtml(title)}</h3>
              <div class="docMeta">Static dataroom placeholder ready for a PDF, Drive link, SharePoint file or internal viewer route.</div>
            </div>
          </div>
        </article>
      `).join("");
    }

    if(notes){
      notes.innerHTML = `
        <div class="sourceNote">
          <div class="eyebrow">Notes</div>
          <div class="small">Internal metrics come from the workbook extraction. Public peer data on this page is market snapshot data, not a substitute for a full multiples database.</div>
          <div class="small">When a ticker was unavailable, suspended or could not be verified cleanly, the UI leaves the quote field as unavailable instead of forcing a proxy.</div>
          <div class="small">Public source used here: <strong>Yahoo Finance chart endpoint snapshot</strong> as of <strong>${escapeHtml(asOfDate(market))}</strong>.</div>
        </div>
      `;
    }

    if(peerGroups){
      peerGroups.innerHTML = (company.groups || []).map((group, index) => `<button class="${index === 0 ? "active" : ""}" data-peer-group="${index}">${escapeHtml(group.label)}</button>`).join("");
      peerGroups.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
        state.group = Number(button.dataset.peerGroup || 0);
        peerGroups.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
        renderPeerSection(company, market, state.group);
      }));
    }

    renderMetricSwitch(company, state);
    renderInternalChart(company, state.metric);
    renderLeverageChart(company);
    renderPeerSection(company, market, state.group);
  }

  function renderMetricSwitch(company, state){
    const target = document.getElementById("metricSwitch");
    if(!target) return;
    const metrics = getMetricKeys(company);
    if(!metrics.length){
      target.innerHTML = `<span class="small muted">No extracted internal series for this company.</span>`;
      return;
    }
    target.innerHTML = metrics.map(metric => `<button class="${metric === state.metric ? "active" : ""}" data-metric="${escapeHtml(metric)}">${escapeHtml(HUMAN[metric] || metric)}</button>`).join("");
    target.querySelectorAll("button").forEach(button => button.addEventListener("click", () => {
      state.metric = button.dataset.metric;
      target.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === button));
      renderInternalChart(company, state.metric);
    }));
  }

  function renderInternalChart(company, metric){
    const target = document.getElementById("internalChart");
    if(!target) return;
    const series = INTERNAL[company.internal]?.[metric];
    if(!series){
      target.innerHTML = emptyState("Internal chart unavailable","No extracted internal series was found for the selected metric.");
      return;
    }
    const points = Object.entries(series).filter(([,value]) => Number.isFinite(value)).map(([label,value]) => ({ label, value }));
    safePlot(target, [{
      type:"scatter",
      mode:"lines+markers",
      x: points.map(point => point.label),
      y: points.map(point => point.value),
      line:{ color:company.color, width:3 },
      marker:{ color:company.color, size:7 },
      hovertemplate:`%{x}<br>%{y}<extra>${escapeHtml(HUMAN[metric] || metric)}</extra>`
    }], {
      paper_bgcolor:"rgba(0,0,0,0)",
      plot_bgcolor:"rgba(0,0,0,0)",
      margin:{ l:56, r:14, t:16, b:56 },
      font:{ family:"IBM Plex Sans, sans-serif", color:"#0b1f3c" },
      xaxis:{ tickangle:-32, gridcolor:"rgba(11,31,60,.08)" },
      yaxis:{ title: HUMAN[metric] || metric, gridcolor:"rgba(11,31,60,.08)", zeroline:false }
    }, "Internal chart unavailable", "Plotly could not be loaded for the internal chart.");
  }

  function renderLeverageChart(company){
    const target = document.getElementById("leverageChart");
    if(!target) return;
    const series = LEVERAGE.series?.[company.lev];
    if(!series){
      target.innerHTML = emptyState("Leverage path unavailable","No leverage trajectory was extracted for this company.");
      return;
    }
    const points = Object.entries(series).map(([label,value]) => ({ label, value }));
    safePlot(target, [{
      type:"scatter",
      mode:"lines+markers",
      x: points.map(point => point.label),
      y: points.map(point => point.value),
      line:{ color:company.color, width:3 },
      marker:{ color:company.color, size:7 },
      hovertemplate:"%{x}<br>Leverage: %{y:.2f}x<extra></extra>"
    }], {
      paper_bgcolor:"rgba(0,0,0,0)",
      plot_bgcolor:"rgba(0,0,0,0)",
      margin:{ l:56, r:14, t:16, b:56 },
      font:{ family:"IBM Plex Sans, sans-serif", color:"#0b1f3c" },
      xaxis:{ tickangle:-26, gridcolor:"rgba(11,31,60,.08)" },
      yaxis:{ title:"Leverage (x)", gridcolor:"rgba(11,31,60,.08)", zeroline:false }
    }, "Leverage chart unavailable", "Plotly could not be loaded for the leverage chart.");
  }

  function renderPeerSection(company, market, groupIndex){
    const snapshotTarget = document.getElementById("peerSnapshots");
    const summaryTarget = document.getElementById("peerSummary");
    const chartTarget = document.getElementById("peerChart");
    const group = (company.groups || [])[groupIndex];

    if(!group){
      if(snapshotTarget) snapshotTarget.innerHTML = emptyState("No direct peers configured","This company stays on the site even without a direct public peer set.");
      if(summaryTarget) summaryTarget.innerHTML = "";
      if(chartTarget) chartTarget.innerHTML = emptyState("Peer chart unavailable","No comparable group was configured for this company.");
      return;
    }

    const peers = group.peers || [];
    const live = peers.map(peer => ({ peer, snapshot: peerSnapshot(peer, market) })).filter(item => item.snapshot?.ok);
    const avgChange = live.length ? live.reduce((sum, item) => sum + (item.snapshot.changePct || 0), 0) / live.length : null;
    const currencies = new Set(live.map(item => item.snapshot.currency).filter(Boolean));

    if(summaryTarget){
      summaryTarget.innerHTML = `
        <div class="card miniMetric"><div class="label">Peer group</div><div class="value">${escapeHtml(group.label)}</div></div>
        <div class="card miniMetric"><div class="label">Live quotes</div><div class="value">${live.length} / ${peers.length}</div></div>
        <div class="card miniMetric"><div class="label">Average 1D move</div><div class="value ${statusClass(avgChange)}">${Number.isFinite(avgChange) ? `${avgChange > 0 ? "+" : ""}${fmt1.format(avgChange)}%` : "Data unavailable"}</div></div>
        <div class="card miniMetric"><div class="label">Currencies covered</div><div class="value">${currencies.size || "Data unavailable"}</div></div>
      `;
    }

    if(snapshotTarget){
      snapshotTarget.innerHTML = peers.map(peer => peerCard(peer, market)).join("");
    }

    renderPeerChart(company, group, market, chartTarget);
  }

  function peerCard(peer, market){
    const snapshot = peerSnapshot(peer, market);
    const hasRange = snapshot && Number.isFinite(snapshot.price) && Number.isFinite(snapshot.low52) && Number.isFinite(snapshot.high52) && snapshot.high52 !== snapshot.low52;
    const rangePct = hasRange ? ((snapshot.price - snapshot.low52) / (snapshot.high52 - snapshot.low52)) * 100 : 0;
    const delta = Number.isFinite(snapshot?.changePct) ? `${snapshot.changePct > 0 ? "+" : ""}${fmt1.format(snapshot.changePct)}%` : "Data unavailable";
    return `
      <article class="peerCard">
        ${mark(peer, "peerLogo")}
        <div>
          <div class="tagRow">
            <span class="badge">${escapeHtml(statusLabel(peer))}</span>
            <span class="badge">${escapeHtml(peer.quoteTicker || peer.ticker || "No ticker")}</span>
          </div>
          <h3 class="peerName">${escapeHtml(peer.name)}</h3>
          <div class="peerMeta">${escapeHtml(snapshot?.exchange || peer.note || "Official website linked; quote unavailable.")}</div>
          <div class="peerMetrics">
            <div class="dataChip">
              <div class="label">Price</div>
              <div class="value">${Number.isFinite(snapshot?.price) ? `${fmt1.format(snapshot.price)} ${escapeHtml(snapshot.currency || "")}` : "Data unavailable"}</div>
            </div>
            <div class="dataChip">
              <div class="label">1D move</div>
              <div class="value delta ${statusClass(snapshot?.changePct)}">${delta}</div>
            </div>
            <div class="dataChip">
              <div class="label">52W low</div>
              <div class="value">${Number.isFinite(snapshot?.low52) ? fmt1.format(snapshot.low52) : "Data unavailable"}</div>
            </div>
            <div class="dataChip">
              <div class="label">52W high</div>
              <div class="value">${Number.isFinite(snapshot?.high52) ? fmt1.format(snapshot.high52) : "Data unavailable"}</div>
            </div>
          </div>
          ${hasRange ? `<div class="rangeBar" title="Current price position inside 52-week range"><div class="rangeFill" style="width:${Math.max(0, Math.min(100, rangePct))}%"></div></div>` : ""}
          <div class="inlineActions" style="margin-top:12px">
            ${peer.domain ? `<a class="btn secondary" href="https://${escapeHtml(peer.domain)}" target="_blank" rel="noreferrer">Website</a>` : ""}
          </div>
        </div>
      </article>
    `;
  }

  function renderPeerChart(company, group, market, target){
    if(!target) return;
    const live = (group.peers || []).map(peer => ({ peer, snapshot: peerSnapshot(peer, market) })).filter(item => item.snapshot?.ok && Array.isArray(item.snapshot.points));
    if(!live.length){
      target.innerHTML = emptyState("Peer chart unavailable","No normalized price history was available for this peer group.");
      return;
    }
    const traces = live.map((item, index) => {
      const norm = normalizedSeries(item.snapshot.points);
      return {
        type:"scatter",
        mode:"lines+markers",
        x: norm.map(point => point.date),
        y: norm.map(point => point.value),
        name: item.peer.name,
        line:{ color: colorScale(company.color, index, live.length), width:2.5 },
        marker:{ size:6 },
        hovertemplate:`${escapeHtml(item.peer.name)}<br>%{x}<br>%{y:.1f}<extra>Indexed to 100</extra>`
      };
    });
    safePlot(target, traces, {
      paper_bgcolor:"rgba(0,0,0,0)",
      plot_bgcolor:"rgba(0,0,0,0)",
      margin:{ l:56, r:14, t:16, b:56 },
      font:{ family:"IBM Plex Sans, sans-serif", color:"#0b1f3c" },
      legend:{ orientation:"h", y:1.12, x:0 },
      xaxis:{ gridcolor:"rgba(11,31,60,.08)" },
      yaxis:{ title:"Indexed price (start = 100)", gridcolor:"rgba(11,31,60,.08)", zeroline:false }
    }, "Peer chart unavailable", "Plotly could not be loaded for the peer performance chart.");
    bindLineFocus(target);
  }

  function initPeers(){
    loadPeerMarket().then(market => {
      bindPeerFilters(market);
      const params = new URLSearchParams(window.location.search);
      renderPeerMonitor(market, {
        query: "",
        era: "all",
        company: params.get("company") || "all"
      });
    });
  }

  function renderPeerMonitor(market, filters = {}){
    const target = document.getElementById("peerMonitor");
    const stats = document.getElementById("peerMonitorStats");
    if(!target || !stats) return;
    const rows = PORTFOLIO.flatMap(company => (company.groups || []).flatMap(group => (group.peers || []).map(peer => ({
      company,
      group,
      peer,
      snapshot: peerSnapshot(peer, market)
    }))));

    const filtered = rows.filter(row => {
      if(filters.era && filters.era !== "all" && row.company.era !== filters.era) return false;
      if(filters.company && filters.company !== "all" && row.company.id !== filters.company) return false;
      if(filters.query){
        const query = filters.query.toLowerCase();
        const haystack = `${row.peer.name} ${row.company.name} ${row.peer.quoteTicker || row.peer.ticker || ""}`.toLowerCase();
        if(!haystack.includes(query)) return false;
      }
      return true;
    });

    const liveCount = filtered.filter(row => row.snapshot?.ok).length;
    const unavailable = filtered.length - liveCount;
    const validChanges = filtered.filter(row => Number.isFinite(row.snapshot?.changePct));
    const avgChange = validChanges.length ? validChanges.reduce((sum,row) => sum + row.snapshot.changePct, 0) / validChanges.length : null;

    stats.innerHTML = `
      <div class="card statCard"><div class="eyebrow">Rows</div><div class="value">${filtered.length}</div><div class="muted small">Peer records after filters.</div></div>
      <div class="card statCard"><div class="eyebrow">Live quotes</div><div class="value">${liveCount}</div><div class="muted small">Yahoo Finance snapshot coverage.</div></div>
      <div class="card statCard"><div class="eyebrow">Unavailable</div><div class="value">${unavailable}</div><div class="muted small">Kept visible without forced proxies.</div></div>
      <div class="card statCard"><div class="eyebrow">Average 1D move</div><div class="value ${statusClass(avgChange)}">${Number.isFinite(avgChange) ? `${avgChange > 0 ? "+" : ""}${fmt1.format(avgChange)}%` : "Data unavailable"}</div><div class="muted small">Across filtered peers with valid quotes.</div></div>
    `;

    target.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Peer</th>
            <th>Company</th>
            <th>Group</th>
            <th>Ticker</th>
            <th>Price</th>
            <th>1D Move</th>
            <th>Exchange</th>
            <th>Source Date</th>
          </tr>
        </thead>
        <tbody>${filtered.map(row => peerRow(row)).join("")}</tbody>
      </table>
    `;
  }

  function peerRow(row){
    const snapshot = row.snapshot;
    return `
      <tr>
        <td>
          <div style="display:flex;align-items:center;gap:12px">
            ${mark(row.peer,"peerLogo")}
            <div>
              <strong>${escapeHtml(row.peer.name)}</strong>
              <div class="small muted">${escapeHtml(statusLabel(row.peer))}</div>
            </div>
          </div>
        </td>
        <td><strong>${escapeHtml(row.company.name)}</strong><div class="small muted">${escapeHtml(row.company.fund)}</div></td>
        <td>${escapeHtml(row.group.label)}</td>
        <td>${escapeHtml(row.peer.quoteTicker || row.peer.ticker || "No ticker")}</td>
        <td>${Number.isFinite(snapshot?.price) ? `${fmt1.format(snapshot.price)} ${escapeHtml(snapshot.currency || "")}` : "Data unavailable"}</td>
        <td class="delta ${statusClass(snapshot?.changePct)}">${Number.isFinite(snapshot?.changePct) ? `${snapshot.changePct > 0 ? "+" : ""}${fmt1.format(snapshot.changePct)}%` : "Data unavailable"}</td>
        <td>${escapeHtml(snapshot?.exchange || "Needs verification")}</td>
        <td>${escapeHtml(snapshot?.fetchedAt || APP.generatedOn || "Needs verification")}</td>
      </tr>
    `;
  }

  function bindPeerFilters(market){
    const query = document.getElementById("peerSearch");
    const era = document.getElementById("peerEra");
    const company = document.getElementById("peerCompany");
    const params = new URLSearchParams(window.location.search);
    if(company){
      company.innerHTML = `<option value="all">All companies</option>${PORTFOLIO.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.fund)} | ${escapeHtml(item.name)}</option>`).join("")}`;
      company.value = params.get("company") || "all";
    }
    const rerender = () => renderPeerMonitor(market, {
      query: query?.value || "",
      era: era?.value || "all",
      company: company?.value || "all"
    });
    [query, era, company].forEach(el => el && el.addEventListener("input", rerender));
    [era, company].forEach(el => el && el.addEventListener("change", rerender));
  }

  function safePlot(target, traces, layout, title, message){
    if(typeof window.Plotly === "undefined"){
      target.innerHTML = emptyState(title, message);
      return;
    }
    try{
      window.Plotly.newPlot(target, traces, layout, {
        responsive:true,
        displaylogo:false,
        modeBarButtonsToRemove:["select2d","lasso2d","toggleSpikelines","autoScale2d"]
      });
    }catch(error){
      target.innerHTML = emptyState(title, `${message}${error?.message ? ` ${error.message}` : ""}`);
    }
  }

  function bindLineFocus(target){
    if(typeof window.Plotly === "undefined" || !target || !target.on) return;
    target.on("plotly_click", event => {
      const traces = target.data || [];
      const clicked = event?.points?.[0]?.curveNumber;
      if(typeof clicked !== "number") return;
      const opacity = traces.map((_, index) => index === clicked ? 1 : 0.18);
      window.Plotly.restyle(target, { opacity });
    });
    target.on("plotly_doubleclick", () => {
      const traces = target.data || [];
      window.Plotly.restyle(target, { opacity: traces.map(() => 1) });
    });
  }

  function median(values){
    const sorted = [...values].sort((a,b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function colorScale(hex, index, total){
    const normalized = Math.max(0, Math.min(1, total <= 1 ? 0.4 : index / (total - 1)));
    const value = hex.replace("#","");
    const full = value.length === 3 ? value.split("").map(char => char + char).join("") : value;
    const r = parseInt(full.slice(0,2),16);
    const g = parseInt(full.slice(2,4),16);
    const b = parseInt(full.slice(4,6),16);
    const mix = 255;
    const weight = 0.12 + normalized * 0.45;
    return `rgb(${Math.round(r + (mix - r) * weight)},${Math.round(g + (mix - g) * weight)},${Math.round(b + (mix - b) * weight)})`;
  }
})();
