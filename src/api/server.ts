import "dotenv/config";
import express from "express";
import { z } from "zod";
import {
  fetchKlines,
  getExchangeInfo,
  getServerTime,
  ping as pingBinance,
} from "../marketdata/binanceClient.js";
import { analyzeMarket } from "./analyze.js";
import { generateAnalystReport } from "../research/report.js";
import { buildResearchSnapshot } from "../research/snapshot.js";
import type { Timeframe } from "../types.js";
import { getMetricsByOrigem, getResearchSnapshot, saveResearchSnapshot } from "../db/repository.js";
import { computeIndicators } from "../features/indicators.js";
import { callJev } from "../jev/jevClient.js";
import { runRemoteJevBacktest } from "../backtest/remoteJev.js";
import { runBenchmarkSuite } from "../backtest/benchmark.js";
import { runRemoteBaselineBacktest } from "../backtest/remoteBaseline.js";
import { runWalkForward } from "../backtest/walkForward.js";
import { runPortfolioEngine } from "../portfolio/engine.js";
import { runWalkForwardPortfolio } from "../portfolio/walkForwardPortfolio.js";
import { getPortfolioRun, getPortfolioEquityCurve } from "../db/repository.js";
import { runRiskRegimeAnalysis } from "../risk/analysis.js";



export const app = express();
app.use(express.json());

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Financial Analyst</title>
  <meta name="description" content="AI-assisted financial analysis and decision engine for crypto assets.">
  <meta property="og:title" content="AI Financial Analyst">
  <meta property="og:description" content="AI-assisted financial analysis and decision engine for crypto assets.">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --green: #10b981;
      --red: #ef4444;
      --yellow: #f59e0b;
      --badge-bg: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.5rem;
    }
    .container { max-width: 1100px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }
    h1 { font-size: 1.5rem; font-weight: 700; color: #fff; }
    .subtitle { color: var(--text-muted); font-size: 0.9rem; }
    .badges { display: flex; gap: 0.5rem; }
    .badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      font-weight: 600;
      background: var(--badge-bg);
      border: 1px solid var(--border);
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 1.5rem; }
    @media (max-width: 768px) { .grid { grid-template-columns: 1fr; } }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .form-group { margin-bottom: 1rem; }
    label { display: block; font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.35rem; }
    input, select {
      width: 100%;
      background: #0f172a;
      border: 1px solid var(--border);
      color: #fff;
      padding: 0.6rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.9rem;
    }
    input:focus, select:focus { outline: none; border-color: var(--primary); }
    .row { display: flex; gap: 0.75rem; }
    .row > div { flex: 1; }
    .checkbox-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      cursor: pointer;
    }
    .checkbox-row input { width: auto; }
    button {
      background: var(--primary);
      color: #fff;
      border: none;
      border-radius: 0.375rem;
      padding: 0.65rem 1.25rem;
      font-weight: 600;
      cursor: pointer;
      width: 100%;
      font-size: 0.95rem;
      transition: background 0.15s;
    }
    button:hover { background: var(--primary-hover); }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .result-box {
      margin-top: 1rem;
      border-top: 1px solid var(--border);
      padding-top: 1rem;
      display: none;
    }
    .rec-badge {
      display: inline-block;
      font-size: 1.1rem;
      font-weight: 700;
      padding: 0.35rem 1rem;
      border-radius: 0.375rem;
      margin-bottom: 0.75rem;
    }
    .rec-BUY { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #059669; }
    .rec-SELL { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #dc2626; }
    .rec-WAIT { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #d97706; }
    .stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.5rem; margin-bottom: 0.75rem; }
    .stat-item {
      background: #0f172a;
      padding: 0.5rem;
      border-radius: 0.25rem;
      font-size: 0.8rem;
    }
    .stat-label { color: var(--text-muted); font-size: 0.75rem; }
    .stat-val { font-weight: 600; color: #fff; }
    pre {
      background: #050811;
      padding: 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.8rem;
      overflow-x: auto;
      max-height: 200px;
      color: #93c5fd;
    }
    .endpoint-list { list-style: none; }
    .endpoint-item {
      padding: 0.5rem 0;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
    }
    .endpoint-item:last-child { border-bottom: none; }
    .endpoint-item a { color: var(--primary); text-decoration: none; font-family: monospace; }
    .endpoint-item a:hover { text-decoration: underline; }
    .method {
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.15rem 0.4rem;
      border-radius: 0.25rem;
      background: #1e293b;
    }
    .method-get { color: #38bdf8; }
    .method-post { color: #4ade80; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>AI Financial Analyst</h1>
        <p class="subtitle">AI-assisted financial analysis and decision engine for crypto assets</p>
      </div>
      <div class="badges">
        <span class="badge"><span class="dot"></span> API Online</span>
        <span class="badge" id="pingBadge">Binance Connected</span>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <div class="card-title">
          <span>Market Analysis Engine</span>
          <span style="font-size:0.75rem;color:var(--text-muted)">POST /api/analyze</span>
        </div>
        <form id="analyzeForm">
          <div class="row">
            <div class="form-group">
              <label for="ativo">Asset Symbol</label>
              <input type="text" id="ativo" value="BTCUSDT" required />
            </div>
            <div class="form-group">
              <label for="timeframe">Timeframe</label>
              <select id="timeframe">
                <option value="1h" selected>1h</option>
                <option value="4h">4h</option>
                <option value="1d">1d</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div class="form-group">
              <label for="valorInvestimento">Investment ($)</label>
              <input type="number" id="valorInvestimento" value="100" min="1" step="any" required />
            </div>
            <div class="form-group">
              <label for="engine">Decision Engine</label>
              <select id="engine">
                <option value="baseline" selected>Baseline (EMA + RSI + ATR)</option>
                <option value="jev">JEV Decision Engine</option>
              </select>
            </div>
          </div>
          <div class="checkbox-row">
            <input type="checkbox" id="news" checked />
            <label for="news" style="margin-bottom:0;cursor:pointer">Include News Sentiment (GDELT)</label>
          </div>
          <button type="submit" id="analyzeBtn">Analyze Market</button>
        </form>

        <div id="resultBox" class="result-box">
          <div id="recBadge" class="rec-badge">BUY</div>
          <div class="stats-grid">
            <div class="stat-item"><div class="stat-label">Current Price</div><div class="stat-val" id="resPrice">-</div></div>
            <div class="stat-item"><div class="stat-label">Position Size</div><div class="stat-val" id="resPos">-</div></div>
            <div class="stat-item"><div class="stat-label">Exposed Capital</div><div class="stat-val" id="resExposed">-</div></div>
            <div class="stat-item"><div class="stat-label">EMA9 / EMA21</div><div class="stat-val" id="resEMA">-</div></div>
            <div class="stat-item"><div class="stat-label">RSI (14)</div><div class="stat-val" id="resRSI">-</div></div>
            <div class="stat-item"><div class="stat-label">High Risk</div><div class="stat-val" id="resRisk">-</div></div>
          </div>
          <p id="resObs" style="font-size:0.8rem;color:var(--text-muted);margin-bottom:0.5rem;"></p>
          <pre id="resJson"></pre>
        </div>
      </div>

      <div class="card">
        <div class="card-title">
          <span>Endpoints & System Status</span>
          <button type="button" onclick="refreshStatus()" style="width:auto;padding:0.25rem 0.6rem;font-size:0.75rem;">Refresh</button>
        </div>
        <ul class="endpoint-list">
          <li class="endpoint-item">
            <div><span class="method method-get">GET</span> <a href="/health" target="_blank">/health</a></div>
            <span style="color:var(--text-muted)">Healthcheck status</span>
          </li>
          <li class="endpoint-item">
            <div><span class="method method-get">GET</span> <a href="/api/market/ping" target="_blank">/api/market/ping</a></div>
            <span id="marketPingText" style="color:var(--text-muted)">Checking...</span>
          </li>
          <li class="endpoint-item">
            <div><span class="method method-get">GET</span> <a href="/api/market/time" target="_blank">/api/market/time</a></div>
            <span id="marketTimeText" style="color:var(--text-muted)">-</span>
          </li>
          <li class="endpoint-item">
            <div><span class="method method-get">GET</span> <a href="/api/market/info?symbol=BTCUSDT" target="_blank">/api/market/info</a></div>
            <span style="color:var(--text-muted)">Exchange Symbol Info</span>
          </li>
          <li class="endpoint-item">
            <div><span class="method method-get">GET</span> <a href="/api/market/klines?symbol=BTCUSDT&timeframe=1h&limit=5" target="_blank">/api/market/klines</a></div>
            <span style="color:var(--text-muted)">Binance Candles</span>
          </li>
          <li class="endpoint-item">
            <div><span class="method method-get">GET</span> <a href="/api/metrics" target="_blank">/api/metrics</a></div>
            <span id="metricsText" style="color:var(--text-muted)">Paper & Backtest Metrics</span>
          </li>
          <li class="endpoint-item">
            <div><span class="method method-post">POST</span> <span style="font-family:monospace">/api/analyze</span></div>
            <span style="color:var(--text-muted)">Decision Engine Pipeline</span>
          </li>
        </ul>
      </div>
    </div>
  </div>

  <script>
    async function refreshStatus() {
      try {
        const pingRes = await fetch('/api/market/ping').then(r => r.json());
        document.getElementById('marketPingText').textContent = pingRes.ping ? 'Connected (OK)' : 'Offline';
      } catch (e) {
        document.getElementById('marketPingText').textContent = 'Error';
      }
      try {
        const timeRes = await fetch('/api/market/time').then(r => r.json());
        if (timeRes.serverTimeUTC) {
          document.getElementById('marketTimeText').textContent = new Date(timeRes.serverTimeUTC).toLocaleTimeString();
        }
      } catch (e) {}
    }
    refreshStatus();

    const form = document.getElementById('analyzeForm');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultBox = document.getElementById('resultBox');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      analyzeBtn.disabled = true;
      analyzeBtn.textContent = 'Analyzing...';
      resultBox.style.display = 'none';

      try {
        const body = {
          ativo: document.getElementById('ativo').value,
          timeframe: document.getElementById('timeframe').value,
          valorInvestimento: Number(document.getElementById('valorInvestimento').value),
          engine: document.getElementById('engine').value,
          news: document.getElementById('news').checked,
        };

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');

        const badge = document.getElementById('recBadge');
        badge.textContent = data.decision.recomendacao;
        badge.className = 'rec-badge rec-' + data.decision.recomendacao;

        document.getElementById('resPrice').textContent = '$' + Number(data.market.precoAtual).toLocaleString();
        document.getElementById('resPos').textContent = data.decision.tamanhoPosicaoPct + '%';
        document.getElementById('resExposed').textContent = '$' + Number(data.valorExposto).toFixed(2);

        const ema9 = data.market.indicators.ema9 ? Number(data.market.indicators.ema9).toFixed(1) : '-';
        const ema21 = data.market.indicators.ema21 ? Number(data.market.indicators.ema21).toFixed(1) : '-';
        document.getElementById('resEMA').textContent = ema9 + ' / ' + ema21;

        document.getElementById('resRSI').textContent = data.market.indicators.rsi ? Number(data.market.indicators.rsi).toFixed(1) : '-';
        document.getElementById('resRisk').textContent = data.decision.riscoElevado ? 'YES (High)' : 'Normal';
        document.getElementById('resObs').textContent = data.decision.observacao || '';
        document.getElementById('resJson').textContent = JSON.stringify(data, null, 2);

        resultBox.style.display = 'block';
      } catch (err) {
        alert('Analysis Error: ' + err.message);
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Analyze Market';
      }
    });
  </script>
</body>
</html>`;

app.get("/", (req, res) => {
  if (req.headers.accept?.includes("text/html") && !req.query.format) {
    return res.type("html").send(HTML_DASHBOARD);
  }
  res.json({
    status: "ok",
    service: "ai-financial-analyst-api",
    endpoints: [
      "/health",
      "/api/analyze",
      "/api/metrics",
      "/api/market/ping",
      "/api/market/time",
      "/api/market/info",
      "/api/market/klines",
    ],
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-financial-analyst-api" });
});

app.get("/api/market/ping", async (_req, res) => {
  try {
    const isAlive = await pingBinance();
    res.json({ status: "ok", ping: isAlive });
  } catch (err: any) {
    res.status(502).json({ status: "error", error: err.message });
  }
});

app.get("/api/market/time", async (_req, res) => {
  try {
    const serverTime = await getServerTime();
    res.json({ status: "ok", serverTime, serverTimeUTC: new Date(serverTime).toISOString() });
  } catch (err: any) {
    res.status(502).json({ status: "error", error: err.message });
  }
});

app.get("/api/market/info", async (req, res) => {
  try {
    const symbol = String(req.query.symbol ?? "BTCUSDT");
    const info = await getExchangeInfo(symbol);
    res.json({ status: "ok", info });
  } catch (err: any) {
    res.status(400).json({ status: "error", error: err.message });
  }
});

const KlinesQuerySchema = z.object({
  symbol: z.string().default("BTCUSDT"),
  timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
  limit: z.coerce.number().min(1).max(1000).default(10),
});

app.get("/api/market/klines", async (req, res) => {
  try {
    const query = KlinesQuerySchema.parse(req.query);
    const klines = await fetchKlines(query.symbol, query.timeframe as Timeframe, query.limit);
    res.json({
      status: "ok",
      symbol: query.symbol.toUpperCase(),
      timeframe: query.timeframe,
      count: klines.length,
      klines,
    });
  } catch (err: any) {
    res.status(400).json({ status: "error", error: err.message });
  }
});

export const AnalyzeSchema = z.object({
  ativo: z.string().min(1).default("BTCUSDT"),
  timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
  valorInvestimento: z.coerce.number().positive().default(100),
  engine: z.enum(["baseline", "jev"]).default("baseline"),
  news: z.boolean().default(true),
});


app.post("/api/report", async (req, res) => {
  try {
    const parsed = AnalyzeSchema.parse(req.body);
    const analysis = await analyzeMarket(parsed);
    const research = await generateAnalystReport(analysis);
    const snapshot = buildResearchSnapshot(analysis, research);
    const stored = await saveResearchSnapshot({ snapshot });
    res.json({
      status: "ok",
      analysis,
      research,
      snapshot: stored.snapshot,
      persistence: {
        snapshotId: stored.snapshotId,
        contentHash: stored.contentHash,
        signalId: stored.signalId,
        decisionLogId: stored.decisionLogId,
        createdAt: stored.createdAt,
      },
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/research/snapshots/:snapshotId", async (req, res) => {
  try {
    const snapshotId = String(req.params.snapshotId ?? "").trim();
    if (!/^rs_[a-f0-9]{24}$/.test(snapshotId)) {
      return res.status(400).json({ status: "error", error: "invalid snapshotId" });
    }

    const stored = await getResearchSnapshot(snapshotId);
    if (!stored) {
      return res.status(404).json({ status: "error", error: "research snapshot not found" });
    }

    res.json({
      status: "ok",
      snapshot: stored.snapshot,
      persistence: {
        snapshotId: stored.snapshotId,
        contentHash: stored.contentHash,
        signalId: stored.signalId,
        decisionLogId: stored.decisionLogId,
        createdAt: stored.createdAt,
      },
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/research/snapshots/:snapshotId", async (req, res) => {
  try {
    const snapshotId = String(req.params.snapshotId ?? "").trim();
    if (!/^rs_[a-f0-9]{24}$/.test(snapshotId)) {
      return res.status(400).json({ status: "error", error: "invalid snapshotId" });
    }
    const stored = await getResearchSnapshot(snapshotId);
    if (!stored) return res.status(404).json({ status: "error", error: "research snapshot not found" });
    res.json({
      status: "ok",
      snapshot: stored.snapshot,
      persistence: {
        snapshotId: stored.snapshotId,
        contentHash: stored.contentHash,
        signalId: stored.signalId,
        decisionLogId: stored.decisionLogId,
        createdAt: stored.createdAt,
      },
    });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/metrics", async (req, res) => {
  try {
    const rawRunId = req.query.runId;
    const runId = rawRunId === undefined ? undefined : Number(rawRunId);
    if (runId !== undefined && (!Number.isInteger(runId) || runId <= 0)) {
      return res.status(400).json({ status: "error", error: "runId must be a positive integer" });
    }
    const metrics = await getMetricsByOrigem(runId);
    res.json({ status: "ok", metrics });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});





app.get("/api/backtest/walk-forward", async (req, res) => {
  try {
    const ativo = String(req.query.symbol ?? "BTCUSDT").toUpperCase();
    const timeframe = String(req.query.timeframe ?? "1h");
    const candles = Number(req.query.candles ?? 5000);
    const initialTrainCandles = Number(req.query.initialTrain ?? 2000);
    const testCandles = Number(req.query.test ?? 500);
    const stepCandles = Number(req.query.step ?? 500);
    const includeJev = String(req.query.includeJev ?? "false").toLowerCase() === "true";

    if (!["1h", "4h", "1d"].includes(timeframe)) {
      return res.status(400).json({ status: "error", error: "timeframe must be 1h, 4h or 1d" });
    }
    if (![candles, initialTrainCandles, testCandles, stepCandles].every(Number.isInteger)) {
      return res.status(400).json({ status: "error", error: "walk-forward parameters must be integers" });
    }

    const result = await runWalkForward({
      ativo,
      timeframe: timeframe as "1h" | "4h" | "1d",
      candles,
      initialTrainCandles,
      testCandles,
      stepCandles,
      includeJev,
    });
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("Insufficient market_data") ? 422 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/backtest/baseline", async (req, res) => {
  try {
    const rawRunId = req.query.fromRun;
    const fromRunId = rawRunId === undefined ? undefined : Number(rawRunId);
    const candles = Number(req.query.candles ?? 5000);
    if (fromRunId !== undefined && (!Number.isInteger(fromRunId) || fromRunId <= 0)) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }
    if (!Number.isInteger(candles) || candles < 1000 || candles > 5000) {
      return res.status(400).json({ status: "error", error: "candles must be an integer between 1000 and 5000" });
    }
    const result = await runRemoteBaselineBacktest(fromRunId, candles);
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/risk/regimes", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    const rawPortfolioRun = req.query.portfolioRun;
    const portfolioRun =
      rawPortfolioRun === undefined ? undefined : Number(rawPortfolioRun);

    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }
    if (
      portfolioRun !== undefined &&
      (!Number.isInteger(portfolioRun) || portfolioRun <= 0)
    ) {
      return res.status(400).json({ status: "error", error: "portfolioRun must be a positive integer" });
    }

    const result = await runRiskRegimeAnalysis(fromRun, portfolioRun);
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/portfolio/run", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }
    const initialCapital = Number(req.query.initialCapital ?? 1000);
    const positionSizePct = Number(req.query.positionSizePct ?? 2);
    const maxGrossExposurePct = Number(req.query.maxGrossExposurePct ?? 20);
    const riskGate = String(req.query.riskGate ?? "false").toLowerCase() === "true";
    const result = await runPortfolioEngine({
      sourceRunId: fromRun,
      initialCapital,
      positionSizePct,
      maxGrossExposurePct,
      riskGate,
    });
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/portfolio/walk-forward", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }

    const initialCapital = Number(req.query.initialCapital ?? 1000);
    const positionSizePct = Number(req.query.positionSizePct ?? 2);
    const maxGrossExposurePct = Number(req.query.maxGrossExposurePct ?? 20);

    const result = await runWalkForwardPortfolio({
      walkForwardRunId: fromRun,
      initialCapital,
      positionSizePct,
      maxGrossExposurePct,
    });
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/portfolio", async (req, res) => {
  try {
    const runId = Number(req.query.runId);
    if (!Number.isInteger(runId) || runId <= 0) {
      return res.status(400).json({ status: "error", error: "runId must be a positive integer" });
    }
    const run = await getPortfolioRun(runId);
    if (!run) return res.status(404).json({ status: "error", error: "portfolio run not found" });
    const curve = await getPortfolioEquityCurve(runId);
    res.json({ status: "ok", run, equityCurve: curve });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/backtest/benchmark", async (req, res) => {
  try {
    const rawRunId = req.query.fromRun;
    const fromRunId = Number(rawRunId ?? 1);
    if (!Number.isInteger(fromRunId) || fromRunId <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }
    const includeJev = String(req.query.includeJev ?? "true").toLowerCase() !== "false";
    const result = await runBenchmarkSuite(fromRunId, includeJev);
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.get("/api/backtest/jev", async (req, res) => {
  try {
    const rawRunId = req.query.fromRun;
    const fromRunId = Number(rawRunId ?? 1);
    if (!Number.isInteger(fromRunId) || fromRunId <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }
    const result = await runRemoteJevBacktest(fromRunId);
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: message });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const parsed = AnalyzeSchema.parse(req.body);
    const result = await analyzeMarket(parsed);
    res.json({ status: "ok", ...result });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: message });
  }
});

const port = Number(process.env.PORT ?? 3000);

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  app.listen(port, "0.0.0.0", () =>
    console.log(`AI Financial Analyst API rodando na porta ${port}`),
  );
}
