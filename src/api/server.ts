import "dotenv/config";
import express from "express";
import { createRateLimitMiddleware, getRequestClientKey, isHeavyApiRequest } from "./rateLimit.js";
import { requestContextMiddleware } from "./requestContext.js";
import { requestObservabilityMiddleware, requestErrorHandler } from "./observability.js";
import { z } from "zod";
import {
  fetchKlines,
  getExchangeInfo,
  getServerTime,
  ping as pingBinance,
} from "../marketdata/binanceClient.js";
import { analyzeMarket } from "./analyze.js";
import { evaluateDecisionLog } from "../evaluation/decisionEvaluator.js";
import { buildCalibrationReport } from "../evaluation/calibration.js";
import { buildOosValidationReport } from "../evaluation/oosValidationReport.js";
import { generateAnalystReport } from "../research/report.js";
import { buildResearchSnapshot } from "../research/snapshot.js";
import type { Timeframe } from "../types.js";
import { getDecisionCalibrationObservations, getDecisionKpis, getDecisionLog, getMarketDataRange, getMetricsByOrigem, getResearchSnapshot, saveResearchSnapshot, settleDecisionLogWithAudit, getOutcomeSettlementAudit, getOutcomeSettlementAuditSummary, getBacktestRun, getWalkForwardRun, getWalkForwardFolds, listOosValidationGateAudits, healthDatabase, savePipelineAuditSnapshot, listPipelineAuditSnapshots } from "../db/repository.js";
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
import { RISK_MAX_GROSS_EXPOSURE_PCT, RISK_POSITION_SIZE_PCT } from "../risk/riskEngine.js";
import { buildEvaluationOverview } from "../product/evaluationOverview.js";
import { buildOutcomeSettlementAudit } from "../evaluation/outcomeSettlementAudit.js";
import { buildSystemValidationForScope } from "../product/systemValidationService.js";
import { buildValidationHistoryForScope, recordValidationSnapshotForScope } from "../product/validationHistoryService.js";
import { settlePendingDecisionLogs } from "../evaluation/pendingSettlement.js";
import { buildPortfolioWalkForwardReport } from "../evaluation/portfolioWalkForwardReport.js";
import { buildPortfolioRegimeDiagnostics } from "../evaluation/portfolioRegimeDiagnostics.js";
import { buildPortfolioGovernanceOverview } from "../product/portfolioGovernanceOverview.js";
import { buildSystemReadinessOverview } from "../product/systemReadiness.js";
import { evaluateMarketDataQuality } from "../marketdata/quality.js";
import { buildOperationalQualityOverview } from "../product/operationalQuality.js";
import { comparePipelineAudits } from "../product/pipelineAudit.js";
import { buildPipelineAuditForRun } from "../product/pipelineAuditService.js";
import { listAiProviders } from "../ai/providers.js";
import { hasValidCronSecret, isProtectedApiRequest, requireApiAuth } from "./auth.js";
import { inspectRuntimeConfig } from "./runtimeConfig.js";
import { buildGovernanceDashboardForScope } from "../product/governanceDashboardService.js";
import { buildContinuousGovernanceForRun } from "../product/continuousGovernanceService.js";
import { buildResearchIntelligenceForSnapshot } from "../research/researchIntelligenceService.js";
import { runJevPaperCycle } from "../papertrading/jevPaperCycle.js";
import { collectLatestMarketData } from "../marketdata/collector.js";



function clientSafeApiError(status: number): string {
  switch (status) {
    case 400:
      return "request could not be processed";
    case 404:
      return "resource not found";
    case 422:
      return "request could not be processed";
    case 503:
      return "service unavailable";
    default:
      return "internal server error";
  }
}

export const app = express();
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);

app.use(requestContextMiddleware);
app.use(requestObservabilityMiddleware);
app.use(express.json());

const apiRateLimitWindowMs = 60_000;
const apiRateLimitMax = Number(process.env.RATE_LIMIT_MAX ?? 120);
const heavyRateLimitMax = Number(process.env.RATE_LIMIT_HEAVY_MAX ?? 20);

const apiRateLimiter = createRateLimitMiddleware({
  windowMs: apiRateLimitWindowMs,
  max: apiRateLimitMax,
  key: (req) => `api:${getRequestClientKey(req)}`,
});

const heavyRateLimiter = createRateLimitMiddleware({
  windowMs: apiRateLimitWindowMs,
  max: heavyRateLimitMax,
  key: (req) => `heavy:${getRequestClientKey(req)}`,
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    apiRateLimiter(req, res, next);
    return;
  }
  next();
});

app.use((req, res, next) => {
  if (isHeavyApiRequest(req)) {
    heavyRateLimiter(req, res, next);
    return;
  }
  next();
});

const apiAuthMiddleware = requireApiAuth();
app.use((req, res, next) => {
  if (isProtectedApiRequest(req)) {
    apiAuthMiddleware(req, res, next);
    return;
  }
  next();
});

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
    .overview-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; margin-bottom: 0.75rem; }
    @media (max-width: 900px) { .overview-grid { grid-template-columns: repeat(2, 1fr); } }
    .overview-item { background:#0f172a; padding:0.65rem; border-radius:0.25rem; }
    .overview-label { color:var(--text-muted); font-size:0.72rem; display:block; margin-bottom:0.15rem; }
    .overview-value { font-size:0.95rem; font-weight:700; }
    .overview-note { color:var(--text-muted); font-size:0.75rem; }
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
          <div class="form-group">
            <label for="apiKey">API Key (protected analysis endpoints)</label>
            <input type="password" id="apiKey" placeholder="X-API-Key" autocomplete="off" />
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
            <div><span class="method method-get">GET</span> <a href="/api/evaluation/portfolio-overview?fromRun=1" target="_blank">/api/evaluation/portfolio-overview</a></div>
            <span style="color:var(--text-muted)">Portfolio governance diagnostics</span>
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
    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">
        <span>Quantitative Quality & Governance</span>
        <button type="button" onclick="refreshEvaluationOverview()" style="width:auto;padding:0.25rem 0.6rem;font-size:0.75rem;">Refresh</button>
      </div>
      <div class="overview-grid">
        <div class="overview-item"><span class="overview-label">Decisions</span><span class="overview-value" id="ovTotal">-</span><span class="overview-note">30-day window</span></div>
        <div class="overview-item"><span class="overview-label">Settled</span><span class="overview-value" id="ovSettled">-</span><span class="overview-note">historical evaluation</span></div>
        <div class="overview-item"><span class="overview-label">Win rate</span><span class="overview-value" id="ovWinRate">-</span><span class="overview-note">settled decisions</span></div>
        <div class="overview-item"><span class="overview-label">Avg trade P&amp;L</span><span class="overview-value" id="ovAvgPnl">-</span><span class="overview-note">settled decisions</span></div>
        <div class="overview-item"><span class="overview-label">Brier</span><span class="overview-value" id="ovBrier">-</span><span class="overview-note">confidence calibration</span></div>
        <div class="overview-item"><span class="overview-label">ECE</span><span class="overview-value" id="ovEce">-</span><span class="overview-note">expected calibration error</span></div>
        <div class="overview-item"><span class="overview-label">OOS audits</span><span class="overview-value" id="ovAudits">-</span><span class="overview-note">persisted gate evaluations</span></div>
        <div class="overview-item"><span class="overview-label">Latest governance</span><span class="overview-value" id="ovGovernance" style="font-size:0.8rem;">-</span><span class="overview-note">latest audit per strategy</span></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">
        <span>Governance Dashboard</span>
        <span class="method method-get">GET /api/product/governance-dashboard</span>
      </div>
      <div class="row">
        <div class="form-group">
          <label for="governanceRun">Walk-forward Run (optional)</label>
          <input type="number" id="governanceRun" min="1" placeholder="e.g. 41" />
        </div>
        <div class="form-group" style="display:flex;align-items:end;">
          <button type="button" onclick="refreshGovernanceDashboard()" style="height:42px;">Refresh Governance</button>
        </div>
      </div>
      <div id="governancePanel" style="display:none;">
        <div class="overview-grid">
          <div class="overview-item"><span class="overview-label">Overall state</span><span class="overview-value" id="govState">-</span></div>
          <div class="overview-item"><span class="overview-label">Market data</span><span class="overview-value" id="govMarket">-</span></div>
          <div class="overview-item"><span class="overview-label">Operational quality</span><span class="overview-value" id="govOperational">-</span></div>
          <div class="overview-item"><span class="overview-label">Pipeline audit</span><span class="overview-value" id="govPipeline">-</span></div>
          <div class="overview-item"><span class="overview-label">Dataset hash</span><span class="overview-value" id="govDataset" style="font-size:0.72rem;word-break:break-all;">-</span></div>
          <div class="overview-item"><span class="overview-label">Evidence hash</span><span class="overview-value" id="govEvidence" style="font-size:0.72rem;word-break:break-all;">-</span></div>
          <div class="overview-item"><span class="overview-label">Pipeline snapshots</span><span class="overview-value" id="govHistory">-</span></div>
          <div class="overview-item"><span class="overview-label">Walk-forward scope</span><span class="overview-value" id="govRun">-</span></div>
        </div>
        <p id="govTraceability" style="font-size:0.8rem;color:var(--text-muted);margin:0.5rem 0;"></p>
        <p style="font-size:0.75rem;color:var(--text-muted);">Read-only governance diagnostics. Regression events and states are not investment recommendations.</p>
        <pre id="govJson"></pre>
      </div>
    </div>
  </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">
        <span>System Validation Cockpit 2.0</span>
        <span class="method method-get">GET /api/system/validation</span>
      </div>
      <div class="row">
        <div class="form-group">
          <label for="validationRun">Walk-forward Run (optional)</label>
          <input type="number" id="validationRun" min="1" placeholder="e.g. 41" />
        </div>
        <div class="form-group" style="display:flex;align-items:end;">
          <button type="button" onclick="refreshSystemValidation()" style="height:42px;">Run Validation</button>
        </div>
      </div>
      <div id="validationPanel" style="display:none;">
        <div class="overview-grid">
          <div class="overview-item"><span class="overview-label">System state</span><span class="overview-value" id="svState">-</span></div>
          <div class="overview-item"><span class="overview-label">Ready checks</span><span class="overview-value" id="svReady">-</span></div>
          <div class="overview-item"><span class="overview-label">Degraded checks</span><span class="overview-value" id="svDegraded">-</span></div>
          <div class="overview-item"><span class="overview-label">Blocked checks</span><span class="overview-value" id="svBlocked">-</span></div>
          <div class="overview-item"><span class="overview-label">Blocking failures</span><span class="overview-value" id="svBlocking">-</span></div>
          <div class="overview-item"><span class="overview-label">Settlement coverage</span><span class="overview-value" id="svSettlement">-</span></div>
          <div class="overview-item"><span class="overview-label">Evidence hash</span><span class="overview-value" id="svEvidence" style="font-size:0.72rem;word-break:break-all;">-</span></div>
          <div class="overview-item"><span class="overview-label">Contract</span><span class="overview-value" id="svContract" style="font-size:0.8rem;">-</span></div>
        </div>
        <div id="svChecks" style="margin:0.75rem 0;"></div>
        <p id="svInterpretation" style="font-size:0.8rem;color:var(--text-muted);"></p>
        <pre id="svJson"></pre>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">
        <span>Validation Evidence Timeline</span>
        <span class="method method-get">GET /api/system/validation/history</span>
      </div>
      <div class="row">
        <div class="form-group">
          <label for="validationHistoryLimit">History limit</label>
          <input type="number" id="validationHistoryLimit" min="1" max="100" value="20" />
        </div>
        <div class="form-group" style="display:flex;align-items:end;">
          <button type="button" onclick="refreshValidationHistory()" style="height:42px;">Load Evidence Timeline</button>
        </div>
      </div>
      <div id="validationHistoryPanel" style="display:none;">
        <div class="overview-grid">
          <div class="overview-item"><span class="overview-label">Snapshots</span><span class="overview-value" id="vhCount">-</span></div>
          <div class="overview-item"><span class="overview-label">Current state</span><span class="overview-value" id="vhCurrent">-</span></div>
          <div class="overview-item"><span class="overview-label">Temporal order</span><span class="overview-value" id="vhTemporal">-</span></div>
          <div class="overview-item"><span class="overview-label">Evidence hashes</span><span class="overview-value" id="vhEvidence">-</span></div>
        </div>
        <div id="vhTimeline" style="margin:0.75rem 0;"></div>
        <pre id="vhJson"></pre>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">
        <span>Continuous Governance</span>
        <span class="method method-get">GET /api/product/continuous-governance</span>
      </div>
      <div class="row">
        <div class="form-group">
          <label for="continuousRun">Walk-forward Run</label>
          <input type="number" id="continuousRun" min="1" placeholder="e.g. 41" />
        </div>
        <div class="form-group" style="display:flex;align-items:end;">
          <button type="button" onclick="checkContinuousGovernance()" style="height:42px;">Check Governance</button>
        </div>
      </div>
      <div id="continuousPanel" style="display:none;">
        <div class="overview-grid">
          <div class="overview-item"><span class="overview-label">State</span><span class="overview-value" id="cgState">-</span></div>
          <div class="overview-item"><span class="overview-label">Regression</span><span class="overview-value" id="cgRegression">-</span></div>
          <div class="overview-item"><span class="overview-label">Blocking events</span><span class="overview-value" id="cgBlocking">-</span></div>
          <div class="overview-item"><span class="overview-label">History</span><span class="overview-value" id="cgHistory">-</span></div>
          <div class="overview-item"><span class="overview-label">Baseline</span><span class="overview-value" id="cgBaseline">-</span></div>
          <div class="overview-item"><span class="overview-label">Dataset consistency</span><span class="overview-value" id="cgDataset">-</span></div>
          <div class="overview-item"><span class="overview-label">Evidence</span><span class="overview-value" id="cgEvidence" style="font-size:0.72rem;word-break:break-all;">-</span></div>
          <div class="overview-item"><span class="overview-label">Snapshot persisted</span><span class="overview-value" id="cgPersisted">-</span></div>
        </div>
        <pre id="cgJson"></pre>
      </div>
    </div>

    <div class="card" style="margin-bottom:1.5rem;">
      <div class="card-title">
        <span>Research Intelligence</span>
        <span class="method method-get">GET /api/product/research-intelligence</span>
      </div>
      <div class="row">
        <div class="form-group">
          <label for="researchSnapshotId">Research Snapshot ID</label>
          <input type="text" id="researchSnapshotId" placeholder="rs_..." />
        </div>
        <div class="form-group" style="display:flex;align-items:end;">
          <button type="button" onclick="loadResearchIntelligence()" style="height:42px;">Open Intelligence</button>
        </div>
      </div>
      <div id="researchPanel" style="display:none;">
        <div class="overview-grid">
          <div class="overview-item"><span class="overview-label">Quality</span><span class="overview-value" id="riCompleteness">-</span></div>
          <div class="overview-item"><span class="overview-label">Evidence</span><span class="overview-value" id="riEvidenceCount">-</span></div>
          <div class="overview-item"><span class="overview-label">Sources</span><span class="overview-value" id="riSources">-</span></div>
          <div class="overview-item"><span class="overview-label">Failed sources</span><span class="overview-value" id="riFailed">-</span></div>
          <div class="overview-item"><span class="overview-label">Positive / Neutral / Negative</span><span class="overview-value" id="riStance">-</span></div>
          <div class="overview-item"><span class="overview-label">Sentiment agreement</span><span class="overview-value" id="riAgreement">-</span></div>
          <div class="overview-item"><span class="overview-label">Snapshot hash</span><span class="overview-value" id="riHash" style="font-size:0.72rem;word-break:break-all;">-</span></div>
          <div class="overview-item"><span class="overview-label">Timestamp alignment</span><span class="overview-value" id="riPit">-</span></div>
        </div>
        <pre id="riJson"></pre>
      </div>
    </div>

    async function loadResearchIntelligence() {
      try {
        const snapshotId = document.getElementById('researchSnapshotId').value.trim();
        if (!snapshotId) throw new Error('Informe um snapshotId de pesquisa.');

        const response = await fetch('/api/product/research-intelligence?snapshotId=' + encodeURIComponent(snapshotId));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Research request failed');

        document.getElementById('researchPanel').style.display = 'block';
        document.getElementById('riCompleteness').textContent = data.quality?.state || '-';
        document.getElementById('riEvidenceCount').textContent = String(data.evidence?.totalCount ?? 0);
        document.getElementById('riSources').textContent = String(data.evidence?.sourceCount ?? 0);
        document.getElementById('riFailed').textContent = String(data.evidence?.sourceStatuses?.filter(s => s.status === 'error').length ?? 0);
        document.getElementById('riStance').textContent =
          [data.aggregate?.positiveCount ?? 0, data.aggregate?.neutralCount ?? 0, data.aggregate?.negativeCount ?? 0].join(' / ');
        document.getElementById('riAgreement').textContent = data.aggregate?.sentimentAgreement || '-';
        document.getElementById('riHash').textContent = data.snapshot?.contentHash || '-';
        document.getElementById('riPit').textContent = data.provenance?.timestampAligned ? 'Aligned' : 'Not aligned';
        document.getElementById('riJson').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        alert('Research Intelligence Error: ' + err.message);
      }
    }

    async function refreshSystemValidation() {
      try {
        const params = new URLSearchParams({
          asset: document.getElementById('ativo').value,
          timeframe: document.getElementById('timeframe').value,
          lookbackDays: '30',
          limit: '20'
        });
        const run = document.getElementById('validationRun').value.trim() ||
          document.getElementById('governanceRun').value.trim();
        if (run) params.set('fromRun', run);

        const response = await fetch('/api/system/validation?' + params.toString());
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'System validation failed');

        document.getElementById('validationPanel').style.display = 'block';
        document.getElementById('svState').textContent = data.state || '-';
        document.getElementById('svReady').textContent = String(data.summary?.readyCount ?? 0);
        document.getElementById('svDegraded').textContent = String(data.summary?.degradedCount ?? 0);
        document.getElementById('svBlocked').textContent = String(data.summary?.blockedCount ?? 0);
        document.getElementById('svBlocking').textContent = String(data.summary?.blockingFailures ?? 0);
        document.getElementById('svEvidence').textContent = data.evidenceHash || '-';
        document.getElementById('svContract').textContent = data.version || '-';

        const settlement = data.checks?.find(check => check.key === 'outcome-settlement');
        document.getElementById('svSettlement').textContent =
          settlement?.evidence?.coveragePct == null
            ? 'No finalized outcomes'
            : Number(settlement.evidence.coveragePct).toFixed(2) + '%';

        document.getElementById('svChecks').innerHTML =
          (data.checks || []).map(check =>
            '<div class="overview-item" style="margin-bottom:0.35rem;">' +
              '<div class="overview-label">' + check.key + '</div>' +
              '<div class="overview-value">' + check.state + '</div>' +
              '<div class="overview-note">' + (check.detail || '') + '</div>' +
            '</div>'
          ).join('');

        document.getElementById('svInterpretation').textContent =
          data.interpretation?.readyMeans || '';

        document.getElementById('svJson').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        alert('System Validation Error: ' + err.message);
      }
    }

    async function refreshValidationHistory() {
      try {
        const params = new URLSearchParams({
          asset: document.getElementById('ativo').value,
          timeframe: document.getElementById('timeframe').value,
          limit: document.getElementById('validationHistoryLimit').value || '20'
        });
        const run = document.getElementById('validationRun').value.trim() ||
          document.getElementById('governanceRun').value.trim();
        if (run) params.set('fromRun', run);

        const response = await fetch('/api/system/validation/history?' + params.toString());
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Validation history failed');

        document.getElementById('validationHistoryPanel').style.display = 'block';
        document.getElementById('vhCount').textContent = String(data.count ?? 0);
        document.getElementById('vhCurrent').textContent = data.current?.state || 'No persisted snapshots';
        document.getElementById('vhTemporal').textContent = data.checks?.temporalOrderValid ? 'Valid' : 'Invalid';
        document.getElementById('vhEvidence').textContent = data.checks?.evidenceHashesValid ? 'Valid SHA-256' : 'Invalid';

        document.getElementById('vhTimeline').innerHTML =
          (data.timeline || []).slice(0, 30).map(event =>
            '<div class="overview-item" style="margin-bottom:0.35rem;">' +
              '<div class="overview-label">' + new Date(event.at).toLocaleString() + ' · ' + event.kind + '</div>' +
              '<div class="overview-value">' + event.state + '</div>' +
              '<div class="overview-note">' + (event.message || '') + '</div>' +
              '<div class="overview-note" style="font-family:monospace;word-break:break-all;">' + (event.evidenceHash || '') + '</div>' +
            '</div>'
          ).join('') || '<p class="overview-note">Nenhum snapshot persistido para o escopo selecionado.</p>';

        document.getElementById('vhJson').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        alert('Validation History Error: ' + err.message);
      }
    }

    async function checkContinuousGovernance() {
      try {
        const run = document.getElementById('continuousRun').value.trim();
        if (!run) throw new Error('Informe um walk-forward run.');

        const response = await fetch('/api/product/continuous-governance?fromRun=' + encodeURIComponent(run));
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Governance request failed');

        document.getElementById('continuousPanel').style.display = 'block';
        document.getElementById('cgState').textContent = data.state || '-';
        document.getElementById('cgRegression').textContent = data.regression?.detected ? 'DETECTED' : 'None';
        document.getElementById('cgBlocking').textContent = String(data.regression?.blockingEventCount ?? 0);
        document.getElementById('cgHistory').textContent = String(data.history?.count ?? 0);
        document.getElementById('cgBaseline').textContent = data.baseline?.snapshotId ?? 'None';
        document.getElementById('cgDataset').textContent = data.checks?.datasetConsistency || 'unknown';
        document.getElementById('cgEvidence').textContent = data.current?.evidenceHash || 'Not available';
        document.getElementById('cgPersisted').textContent = data.checks?.snapshotPersisted ? 'Yes' : 'No (GET)';
        document.getElementById('cgJson').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        alert('Continuous Governance Error: ' + err.message);
      }
    }

  <script>
    async function refreshGovernanceDashboard() {
      try {
        const params = new URLSearchParams({
          asset: document.getElementById('ativo').value,
          timeframe: document.getElementById('timeframe').value,
          lookbackDays: '30',
          limit: '20'
        });
        const run = document.getElementById('governanceRun').value.trim();
        if (run) params.set('fromRun', run);

        const response = await fetch('/api/product/governance-dashboard?' + params.toString());
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Governance request failed');

        document.getElementById('governancePanel').style.display = 'block';
        document.getElementById('govState').textContent = data.state || '-';
        document.getElementById('govMarket').textContent = data.marketData?.status || '-';
        document.getElementById('govOperational').textContent = data.operationalQuality?.state || '-';
        document.getElementById('govPipeline').textContent = data.pipeline?.available ? (data.pipeline.current?.state || '-') : 'Not scoped';
        document.getElementById('govDataset').textContent = data.evidence?.datasetHash || 'Not available';
        document.getElementById('govEvidence').textContent = data.evidence?.currentPipelineEvidenceHash || 'Not available';
        document.getElementById('govHistory').textContent = String(data.pipeline?.history?.length ?? 0);
        document.getElementById('govRun').textContent = data.scope?.walkForwardRunId ?? 'Not selected';

        const trace = data.traceability || {};
        document.getElementById('govTraceability').textContent =
          'Traceability: ' +
          ['dataset', 'oos', 'walk-forward', 'portfolio', 'product']
            .map((key) => key + '=' + (
              key === 'walk-forward'
                ? Boolean(data.scope?.walkForwardRunId)
                : key === 'dataset'
                  ? trace.datasetLinked
                  : key === 'oos'
                    ? trace.oosLinked
                    : key === 'portfolio'
                      ? trace.portfolioLinked
                      : trace.productLinked
            ))
            .join(' · ');

        document.getElementById('govJson').textContent = JSON.stringify(data, null, 2);
      } catch (err) {
        alert('Governance Error: ' + err.message);
      }
    }

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
    async function refreshEvaluationOverview() {
      try {
        const params = new URLSearchParams({
          ativo: document.getElementById('ativo').value,
          timeframe: document.getElementById('timeframe').value,
          lookbackDays: '30'
        });
        const overview = await fetch('/api/evaluation/overview?' + params.toString()).then(r => r.json());
        if (!overview || overview.status !== 'ok') return;

        const q = overview.decisionQuality || {};
        const cal = overview.calibration || {};
        const gov = overview.governance || {};

        document.getElementById('ovTotal').textContent = q.totalDecisions ?? '-';
        document.getElementById('ovSettled').textContent = q.settledDecisions ?? '-';
        document.getElementById('ovWinRate').textContent = q.winRate == null ? '-' : Number(q.winRate).toFixed(2) + '%';
        document.getElementById('ovAvgPnl').textContent = q.avgTradeProfitPercent == null ? '-' : Number(q.avgTradeProfitPercent).toFixed(3) + '%';
        document.getElementById('ovBrier').textContent = cal.brierScore == null ? '-' : Number(cal.brierScore).toFixed(4);
        document.getElementById('ovEce').textContent = cal.expectedCalibrationError == null ? '-' : Number(cal.expectedCalibrationError).toFixed(4);
        document.getElementById('ovAudits').textContent = gov.auditCount ?? '0';
        const latest = (gov.latestByStrategy || []).map(item => item.strategy + ': ' + item.status).join(' · ');
        document.getElementById('ovGovernance').textContent = latest || 'Sem auditorias OOS';
      } catch (e) {
        document.getElementById('ovGovernance').textContent = 'Overview indisponível';
      }
    }
    const apiKeyInput = document.getElementById('apiKey');
    apiKeyInput.value = sessionStorage.getItem('ai-financial-analyst-api-key') || '';
    apiKeyInput.addEventListener('input', () => {
      sessionStorage.setItem('ai-financial-analyst-api-key', apiKeyInput.value.trim());
    });

    refreshStatus();
    refreshEvaluationOverview();
    refreshSystemValidation();
    refreshValidationHistory();

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

        const apiKey = apiKeyInput.value.trim();
        const headers = { 'Content-Type': 'application/json' };
        if (apiKey) headers['X-API-Key'] = apiKey;

        const res = await fetch('/api/analyze', {
          method: 'POST',
          headers,
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

app.get("/api/evaluation/pipeline-audit", async (req, res) => {
  try {
    const query = z.object({
      fromRun: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }).parse(req.query);

    const audit = await buildPipelineAuditForRun({
      walkForwardRunId: query.fromRun,
      auditLimit: query.limit,
    });

    res.json({ status: "ok", ...audit });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.post("/api/evaluation/pipeline-audit/snapshots", async (req, res) => {
  try {
    const body = z.object({
      fromRun: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().min(1).max(100).default(100),
    }).parse(req.body);

    const audit = await buildPipelineAuditForRun({
      walkForwardRunId: body.fromRun,
      auditLimit: body.limit,
    });

    const previousSnapshots = await listPipelineAuditSnapshots({
      walkForwardRunId: body.fromRun,
      limit: 10,
    });

    const previous = previousSnapshots.find(
      (snapshot) => snapshot.evidenceHash !== audit.evidenceHash,
    )?.snapshot ?? null;

    const snapshot = await savePipelineAuditSnapshot({ snapshot: audit });
    const regression = previous
      ? comparePipelineAudits(previous, audit)
      : {
          comparable: false,
          regressed: false,
          events: [],
        };

    res.status(201).json({
      status: "ok",
      snapshotId: snapshot.id,
      createdAt: snapshot.createdAt.toISOString(),
      evidenceHash: snapshot.evidenceHash,
      state: snapshot.state,
      regression,
      audit,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/pipeline-audit/history", async (req, res) => {
  try {
    const query = z.object({
      fromRun: z.coerce.number().int().positive(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(req.query);

    const snapshots = await listPipelineAuditSnapshots({
      walkForwardRunId: query.fromRun,
      limit: query.limit,
    });

    const history = snapshots.map((snapshot, index) => {
      const newer = snapshots[index - 1];
      const regression = newer
        ? comparePipelineAudits(snapshot.snapshot, newer.snapshot)
        : null;

      return {
        snapshotId: snapshot.id,
        createdAt: snapshot.createdAt.toISOString(),
        state: snapshot.state,
        evidenceHash: snapshot.evidenceHash,
        datasetHash: snapshot.datasetHash,
        regressionFromPrevious: regression,
      };
    });

    res.json({
      status: "ok",
      walkForwardRunId: query.fromRun,
      count: history.length,
      history,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/operational-quality", async (req, res) => {
  try {
    const query = z.object({
      ativo: z.string().min(1).default("BTCUSDT"),
      timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
      limit: z.coerce.number().int().min(1).max(50).default(10),
      fromRun: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const now = new Date();
    const from = new Date(now.getTime() - query.lookbackDays * 24 * 60 * 60 * 1000);
    const to = now;

    const [marketDataCheck, databaseCheck, marketKlines, kpis, observations, audits] =
      await Promise.all([
        pingBinance()
          .then((ok) => ({ available: ok, detail: ok ? "Binance ping OK" : "Binance ping failed" }))
          .catch((error: unknown) => ({
            available: false,
            detail: error instanceof Error ? error.message : String(error),
          })),
        healthDatabase()
          .then(() => ({ available: true, detail: "Database query OK" }))
          .catch((error: unknown) => ({
            available: false,
            detail: error instanceof Error ? error.message : String(error),
          })),
        fetchKlines(query.ativo, query.timeframe as Timeframe, 2),
        getDecisionKpis({
          ativo: query.ativo,
          timeframe: query.timeframe,
          from,
          to,
        }),
        getDecisionCalibrationObservations({
          ativo: query.ativo,
          timeframe: query.timeframe,
          from,
          to,
        }),
        listOosValidationGateAudits({
          ativo: query.ativo,
          timeframe: query.timeframe,
          strategy: undefined,
          limit: query.limit,
        }),
      ]);

    const readiness = buildSystemReadinessOverview({
      generatedAt: now,
      marketData: marketDataCheck,
      database: databaseCheck,
      aiProviders: listAiProviders(),
      paperTradingOnly: true,
      apiAuthenticationConfigured: Boolean(process.env.API_AUTH_TOKEN?.trim()),
      runtimeConfig: inspectRuntimeConfig(),
      governanceContracts: [
        "evaluation-overview.v1",
        "operational-quality.v1",
        "pipeline-audit.v1",
        "pipeline-audit-history.v1",
        "governance-dashboard.v1",
        "continuous-governance.v1",
      "outcome-settlement-audit.v1",
      "system-validation.v1",
        "research-intelligence.v1",
        "portfolio-governance-overview.v2",
        "portfolio-stability.v1",
      ],
    });

    const marketData = evaluateMarketDataQuality({
      timeframe: query.timeframe,
      candles: marketKlines,
      checkedAt: now,
    });

    const evaluation = buildEvaluationOverview({
      generatedAt: now,
      from,
      to,
      ativo: query.ativo,
      timeframe: query.timeframe,
      kpis,
      calibration: buildCalibrationReport(observations, {
        ativo: query.ativo,
        timeframe: query.timeframe,
        from,
        to,
      }),
      audits,
    });

    let portfolio;
    if (query.fromRun !== undefined) {
      const [portfolioReport, regimeDiagnostics] = await Promise.all([
        buildPortfolioWalkForwardReport(query.fromRun),
        buildPortfolioRegimeDiagnostics(query.fromRun),
      ]);
      portfolio = buildPortfolioGovernanceOverview({
        generatedAt: now,
        portfolioReport,
        regimeDiagnostics,
      });
    }

    const quality = buildOperationalQualityOverview({
      generatedAt: now,
      asset: query.ativo,
      timeframe: query.timeframe,
      portfolioRunId: query.fromRun,
      readiness,
      marketData,
      evaluation,
      portfolio,
    });

    res.json({ status: "ok", ...quality });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/product/governance-dashboard", async (req, res) => {
  try {
    const query = z.object({
      asset: z.string().min(1).max(32).default("BTCUSDT"),
      timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      fromRun: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const dashboard = await buildGovernanceDashboardForScope(query);
    res.json({ status: "ok", ...dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/product/continuous-governance", async (req, res) => {
  try {
    const query = z.object({
      fromRun: z.coerce.number().int().positive(),
      auditLimit: z.coerce.number().int().min(1).max(100).default(100),
      historyLimit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(req.query);

    const governance = await buildContinuousGovernanceForRun({
      walkForwardRunId: query.fromRun,
      auditLimit: query.auditLimit,
      historyLimit: query.historyLimit,
      persist: false,
    });

    res.json({ status: "ok", ...governance });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.post("/api/product/continuous-governance/check", async (req, res) => {
  try {
    const body = z.object({
      fromRun: z.coerce.number().int().positive(),
      auditLimit: z.coerce.number().int().min(1).max(100).default(100),
      historyLimit: z.coerce.number().int().min(1).max(100).default(20),
    }).parse(req.body);

    const governance = await buildContinuousGovernanceForRun({
      walkForwardRunId: body.fromRun,
      auditLimit: body.auditLimit,
      historyLimit: body.historyLimit,
      persist: true,
    });

    res.status(201).json({ status: "ok", ...governance });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/product/research-intelligence", async (req, res) => {
  try {
    const query = z.object({
      snapshotId: z.string().regex(/^rs_[a-f0-9]{24}$/),
    }).parse(req.query);

    const intelligence = await buildResearchIntelligenceForSnapshot(query.snapshotId);
    res.json({ status: "ok", ...intelligence });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message.includes("not found") ? 404 :
      message.includes("DATABASE_URL") ? 503 :
      400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/system/validation", async (req, res) => {
  try {
    const query = z.object({
      asset: z.string().min(1).max(32).default("BTCUSDT"),
      timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
      limit: z.coerce.number().int().min(1).max(50).default(20),
      fromRun: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const validation = await buildSystemValidationForScope(query);
    res.json({ status: "ok", ...validation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/system/validation/history", async (req, res) => {
  try {
    const query = z.object({
      asset: z.string().min(1).max(32).default("BTCUSDT"),
      timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      fromRun: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const history = await buildValidationHistoryForScope(query);
    res.json({ status: "ok", ...history });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.post("/api/system/validation/history", async (req, res) => {
  try {
    const body = z.object({
      asset: z.string().min(1).max(32).default("BTCUSDT"),
      timeframe: z.enum(["1h", "4h", "1d"]).default("1h"),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      fromRun: z.coerce.number().int().positive().optional(),
    }).parse(req.body);

    const result = await recordValidationSnapshotForScope(body);
    res.status(201).json({
      status: "ok",
      snapshotId: result.snapshot.id,
      createdAt: result.snapshot.createdAt.toISOString(),
      evidenceHash: result.snapshot.evidenceHash,
      state: result.snapshot.state,
      history: result.history,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status =
      message.includes("not found") ? 404 :
      message.includes("DATABASE_URL") ? 503 :
      400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

async function collectSystemReadinessOverview() {
  const [marketDataCheck, databaseCheck] = await Promise.all([
    Promise.resolve()
      .then(() => pingBinance())
      .then((ok) => ({ available: ok, detail: ok ? "Binance ping OK" : "Binance ping failed" }))
      .catch((error: unknown) => ({
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      })),
    Promise.resolve()
      .then(() => healthDatabase())
      .then(() => ({ available: true, detail: "Database query OK" }))
      .catch((error: unknown) => ({
        available: false,
        detail: error instanceof Error ? error.message : String(error),
      })),
  ]);

  return buildSystemReadinessOverview({
    generatedAt: new Date(),
    marketData: marketDataCheck,
    database: databaseCheck,
    aiProviders: listAiProviders(),
    paperTradingOnly: true,
    apiAuthenticationConfigured: Boolean(process.env.API_AUTH_TOKEN?.trim()),
    runtimeConfig: inspectRuntimeConfig(),
    governanceContracts: [
      "evaluation-overview.v1",
      "operational-quality.v1",
      "pipeline-audit.v1",
      "pipeline-audit-history.v1",
      "governance-dashboard.v1",
      "continuous-governance.v1",
      "outcome-settlement-audit.v1",
      "system-validation.v1",
      "validation-history.v1",
      "research-intelligence.v1",
      "portfolio-governance-overview.v2",
      "portfolio-stability.v1",
    ],
  });
}

app.get("/api/system/readiness", async (_req, res) => {
  const overview = await collectSystemReadinessOverview();
  res.status(200).json({
    status: overview.state === "ready" ? "ok" : "degraded",
    ready: overview.state === "ready",
    timestamp: overview.generatedAt,
  });
});

app.get("/api/system/readiness/details", async (_req, res) => {
  const overview = await collectSystemReadinessOverview();
  res.status(200).json({ status: "ok", ...overview });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ai-financial-analyst-api" });
});

app.get("/api/market/ping", async (_req, res) => {
  try {
    const isAlive = await pingBinance();
    res.json({ status: "ok", ping: isAlive });
  } catch (err) {
    res.status(502).json({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/market/time", async (_req, res) => {
  try {
    const serverTime = await getServerTime();
    res.json({ status: "ok", serverTime, serverTimeUTC: new Date(serverTime).toISOString() });
  } catch (err) {
    res.status(502).json({ status: "error", error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/market/info", async (req, res) => {
  try {
    const symbol = String(req.query.symbol ?? "BTCUSDT");
    const info = await getExchangeInfo(symbol);
    res.json({ status: "ok", info });
  } catch (err) {
    res.status(400).json({ status: "error", error: err instanceof Error ? err.message : String(err) });
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
  } catch (err) {
    res.status(400).json({ status: "error", error: err instanceof Error ? err.message : String(err) });
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
    const stored = await saveResearchSnapshot({ snapshot, decisionLogId: analysis.decisionLogId });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});


app.post("/api/evaluation/decisions/settle-pending", async (req, res) => {
  try {
    const body = z.object({
      ativo: z.string().min(1).optional(),
      timeframe: z.enum(["1h", "4h", "1d"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(100),
      lookaheadCandles: z.coerce.number().int().min(1).max(5000).default(24),
      flatThresholdPct: z.coerce.number().min(0).max(100).default(0.1),
      evaluatedAt: z.string().datetime().optional(),
    }).parse(req.body);

    const result = await settlePendingDecisionLogs({
      ativo: body.ativo,
      timeframe: body.timeframe,
      limit: body.limit,
      lookaheadCandles: body.lookaheadCandles,
      flatThresholdPct: body.flatThresholdPct,
      evaluatedAt: body.evaluatedAt ? new Date(body.evaluatedAt) : undefined,
    });

    res.json({
      status: "ok",
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.post("/api/evaluation/decisions/:decisionLogId", async (req, res) => {
  try {
    const decisionLogId = Number(req.params.decisionLogId);
    if (!Number.isInteger(decisionLogId) || decisionLogId <= 0) {
      return res.status(400).json({ status: "error", error: "decisionLogId must be a positive integer" });
    }

    const body = z.object({
      lookaheadCandles: z.coerce.number().int().min(1).max(5000).default(24),
      flatThresholdPct: z.coerce.number().min(0).max(100).default(0.1),
      evaluatedAt: z.string().datetime().optional(),
    }).parse(req.body);

    const decision = await getDecisionLog(decisionLogId);
    if (!decision) {
      return res.status(404).json({ status: "error", error: "decision log not found" });
    }
    if (decision.outcomeStatus !== "pending") {
      return res.status(409).json({ status: "error", error: "decision log is already settled" });
    }

    const evaluatedAt = body.evaluatedAt ? new Date(body.evaluatedAt) : new Date();
    const candles = await getMarketDataRange(
      decision.ativo,
      decision.timeframe,
      decision.dataAsOf,
      evaluatedAt,
    );

    const evaluation = evaluateDecisionLog(
      decision,
      candles,
      evaluatedAt,
      {
        lookaheadCandles: body.lookaheadCandles,
        flatThresholdPct: body.flatThresholdPct,
      },
    );

    const audit = buildOutcomeSettlementAudit({
      decision,
      candles,
      evaluation,
      evaluatedAt,
      config: {
        lookaheadCandles: body.lookaheadCandles,
        flatThresholdPct: body.flatThresholdPct,
      },
    });

    await settleDecisionLogWithAudit(decisionLogId, evaluation.outcome, audit);

    res.json({
      status: "ok",
      decisionLogId,
      evaluation: {
        referencePrice: evaluation.referencePrice,
        evaluationCandleClose: evaluation.evaluationCandleClose,
        evaluationPrice: evaluation.evaluationPrice,
        lookaheadCandles: evaluation.lookaheadCandles,
        forwardReturnPercent: evaluation.forwardReturnPercent,
        outcomeDirection: evaluation.outcomeDirection,
        tradeProfitPercent: evaluation.tradeProfitPercent,
        outcomeStatus: evaluation.outcome.outcomeStatus,
        evaluatedAt,
        audit: {
          version: audit.version,
          evidenceHash: audit.evidenceHash,
          marketDataHash: audit.marketDataHash,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503
      : message.includes("Insufficient future closed candles") ? 422
      : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/decisions/:decisionLogId/audit", async (req, res) => {
  try {
    const decisionLogId = Number(req.params.decisionLogId);
    if (!Number.isInteger(decisionLogId) || decisionLogId <= 0) {
      return res.status(400).json({ status: "error", error: "decisionLogId must be a positive integer" });
    }

    const audit = await getOutcomeSettlementAudit(decisionLogId);
    if (!audit) {
      return res.status(404).json({ status: "error", error: "outcome settlement audit not found" });
    }

    res.json({ status: "ok", ...audit });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/settlement-audit", async (req, res) => {
  try {
    const query = z.object({
      ativo: z.string().min(1).optional(),
      timeframe: z.enum(["1h", "4h", "1d"]).optional(),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
    }).parse(req.query);

    const now = new Date();
    const from = new Date(now.getTime() - query.lookbackDays * 24 * 60 * 60 * 1000);
    const summary = await getOutcomeSettlementAuditSummary({
      ativo: query.ativo,
      timeframe: query.timeframe,
      from,
      to: now,
    });

    res.json({ status: "ok", generatedAt: now.toISOString(), ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/overview", async (req, res) => {
  try {
    const query = z.object({
      ativo: z.string().min(1).optional(),
      timeframe: z.enum(["1h", "4h", "1d"]).optional(),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
      limit: z.coerce.number().int().min(1).max(50).default(10),
    }).parse(req.query);

    const now = new Date();
    const from = new Date(now.getTime() - query.lookbackDays * 24 * 60 * 60 * 1000);
    const to = now;
    const filters = {
      ativo: query.ativo,
      timeframe: query.timeframe,
      from,
      to,
    };

    const [kpis, observations, audits] = await Promise.all([
      getDecisionKpis(filters),
      getDecisionCalibrationObservations(filters),
      listOosValidationGateAudits({
        ativo: query.ativo,
        timeframe: query.timeframe,
        strategy: undefined,
        limit: query.limit,
      }),
    ]);

    const calibration = buildCalibrationReport(observations, filters);
    const overview = buildEvaluationOverview({
      generatedAt: now,
      from,
      to,
      ativo: query.ativo,
      timeframe: query.timeframe,
      kpis,
      calibration,
      audits,
    });

    res.json({ status: "ok", ...overview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});
app.get("/api/evaluation/kpis", async (req, res) => {
  try {
    const query = z.object({
      ativo: z.string().min(1).optional(),
      timeframe: z.enum(["1h", "4h", "1d"]).optional(),
      origem: z.enum(["baseline", "jev"]).optional(),
      recomendacao: z.enum(["BUY", "WAIT", "SELL"]).optional(),
      riskRegime: z.string().min(1).max(64).optional(),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(30),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(req.query);

    const now = new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(now.getTime() - query.lookbackDays * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : now;

    if (to.getTime() < from.getTime()) {
      return res.status(400).json({ status: "error", error: "to must be after from" });
    }

    const kpis = await getDecisionKpis({
      ativo: query.ativo,
      timeframe: query.timeframe,
      origem: query.origem,
      recomendacao: query.recomendacao,
      riskRegime: query.riskRegime,
      from,
      to,
    });

    res.json({
      status: "ok",
      generatedAt: now.toISOString(),
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      ...kpis,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/calibration", async (req, res) => {
  try {
    const query = z.object({
      ativo: z.string().min(1).optional(),
      timeframe: z.enum(["1h", "4h", "1d"]).optional(),
      origem: z.enum(["baseline", "jev"]).optional(),
      recomendacao: z.enum(["BUY", "WAIT", "SELL"]).optional(),
      riskRegime: z.string().min(1).max(64).optional(),
      lookbackDays: z.coerce.number().int().min(1).max(3650).default(90),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    }).parse(req.query);

    const now = new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(now.getTime() - query.lookbackDays * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : now;

    if (to.getTime() < from.getTime()) {
      return res.status(400).json({ status: "error", error: "to must be after from" });
    }

    const filters = {
      ativo: query.ativo,
      timeframe: query.timeframe,
      origem: query.origem,
      recomendacao: query.recomendacao,
      riskRegime: query.riskRegime,
      from,
      to,
    };

    const observations = await getDecisionCalibrationObservations(filters);
    const calibration = buildCalibrationReport(observations, filters);

    res.json({
      status: "ok",
      generatedAt: now.toISOString(),
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      ...calibration,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/oos-report", async (req, res) => {
  try {
    const query = z.object({
      backtestRunId: z.coerce.number().int().positive(),
      walkForwardRunId: z.coerce.number().int().positive().optional(),
    }).parse(req.query);

    const backtestRun = await getBacktestRun(query.backtestRunId);
    if (!backtestRun) {
      return res.status(404).json({ status: "error", error: "backtest run not found" });
    }

    if (backtestRun.mode !== "oos") {
      return res.status(422).json({ status: "error", error: "backtestRunId must reference an oos run" });
    }

    if (!backtestRun.validationStart || !backtestRun.calibrationEnd) {
      return res.status(422).json({ status: "error", error: "backtest run is missing OOS calibration/validation boundaries" });
    }

    const validationFrom = backtestRun.validationStart;
    const validationTo = backtestRun.periodoFim;
    const filters = {
      ativo: backtestRun.ativo,
      timeframe: backtestRun.timeframe,
      from: validationFrom,
      to: validationTo,
    };

    const [decisionKpis, observations, walkForwardRun] = await Promise.all([
      getDecisionKpis(filters),
      getDecisionCalibrationObservations(filters),
      query.walkForwardRunId ? getWalkForwardRun(query.walkForwardRunId) : Promise.resolve(null),
    ]);

    if (query.walkForwardRunId && !walkForwardRun) {
      return res.status(404).json({ status: "error", error: "walk-forward run not found" });
    }

    const folds = walkForwardRun
      ? await getWalkForwardFolds(walkForwardRun.id)
      : [];

    const calibration = buildCalibrationReport(observations, filters);
    const report = buildOosValidationReport({
      backtestRun,
      walkForwardRun,
      folds,
      calibration,
      decisionKpis,
    });

    res.json({ status: "ok", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("Insufficient market_data") ? 422 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/portfolio/run", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }
    const initialCapital = Number(req.query.initialCapital ?? 1000);
    const positionSizePct = Number(req.query.positionSizePct ?? RISK_POSITION_SIZE_PCT);
    const maxGrossExposurePct = Number(req.query.maxGrossExposurePct ?? RISK_MAX_GROSS_EXPOSURE_PCT);
    const riskGate = String(req.query.riskGate ?? "false").toLowerCase() === "true";
    const result = await runPortfolioEngine({
      sourceRunId: fromRun,
      initialCapital,
      positionSizePct,
      maxGrossExposurePct,
      riskGate,
    });
    res.json({ status: "ok", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/portfolio/walk-forward", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({ status: "error", error: "fromRun must be a positive integer" });
    }

    const initialCapital = Number(req.query.initialCapital ?? 1000);
    const positionSizePct = Number(req.query.positionSizePct ?? RISK_POSITION_SIZE_PCT);
    const maxGrossExposurePct = Number(req.query.maxGrossExposurePct ?? RISK_MAX_GROSS_EXPOSURE_PCT);

    const result = await runWalkForwardPortfolio({
      walkForwardRunId: fromRun,
      initialCapital,
      positionSizePct,
      maxGrossExposurePct,
    });
    res.json({ status: "ok", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/portfolio-overview", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({
        status: "error",
        error: "fromRun must be a positive integer",
      });
    }

    const [portfolioReport, regimeDiagnostics] = await Promise.all([
      buildPortfolioWalkForwardReport(fromRun),
      buildPortfolioRegimeDiagnostics(fromRun),
    ]);

    const overview = buildPortfolioGovernanceOverview({
      generatedAt: new Date(),
      portfolioReport,
      regimeDiagnostics,
    });

    res.json({ status: "ok", ...overview });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/evaluation/portfolio-walk-forward", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({
        status: "error",
        error: "fromRun must be a positive integer",
      });
    }

    const report = await buildPortfolioWalkForwardReport(fromRun);
    res.json({ status: "ok", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

// Portfolio regime diagnostics endpoint (deterministic, read-only).
app.get("/api/evaluation/portfolio-regimes", async (req, res) => {
  try {
    const fromRun = Number(req.query.fromRun);
    if (!Number.isInteger(fromRun) || fromRun <= 0) {
      return res.status(400).json({
        status: "error",
        error: "fromRun must be a positive integer",
      });
    }

    const report = await buildPortfolioRegimeDiagnostics(fromRun);
    res.json({ status: "ok", ...report });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.post("/api/analyze", async (req, res) => {
  try {
    const parsed = AnalyzeSchema.parse(req.body);
    const result = await analyzeMarket(parsed);
    res.json({ status: "ok", ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 400;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/cron/market-data", async (req, res) => {
  const provided = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!hasValidCronSecret(provided)) {
    return res.status(401).json({ status: "error", error: "unauthorized" });
  }

  try {
    const collection = await collectLatestMarketData("BTCUSDT", ["1h", "4h", "1d"]);
    res.json({ status: "ok", ...collection });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("DATABASE_URL") ? 503 : 500;
    res.status(status).json({ status: "error", error: clientSafeApiError(status) });
  }
});

app.get("/api/cron/paper-jev-cycle", async (req, res) => {
  const provided = req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();

  if (!hasValidCronSecret(provided)) {
    return res.status(401).json({ status: "error", error: "unauthorized" });
  }

  if (process.env.PAPER_JEV_AUTORUN !== "true") {
    return res.status(503).json({
      status: "error",
      code: "PAPER_JEV_AUTORUN_DISABLED",
      error: "Paper JEV cycle is disabled by runtime configuration",
    });
  }

  try {
    const cycle = await runJevPaperCycle({
      ativo: "BTCUSDT",
      timeframes: ["1h", "4h", "1d"],
      valorInvestimento: 100,
      news: true,
    });
    res.json({ status: "ok", enabled: true, ...cycle });
  } catch {
    res.status(500).json({ status: "error", error: "internal server error" });
  }
});

app.use(requestErrorHandler);

// The root server.ts -> createApp.startServer() is the single production entrypoint.
// This module is imported by createApp.ts and must never bind a port as a side effect.
