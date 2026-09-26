# AI Financial Analyst

MVP pessoal de análise financeira assistida por IA.

## Escopo travado
- BTC/USD
- Timeframes: 1h, 4h e 1D
- Paper trading apenas
- Jev com versão fixada
- Baseline sem Jev
- Position sizing fixo e conservador
- Thresholds congelados antes de OOS

## Playlist de implementação
1. Setup & Infra
2. Schema do Banco
3. Ingestão de Mercado
4. Feature Engine
5. Pipeline de Sentimento
6. Adapter Jev
7. Decision Engine + Sizing
8. Baseline
9. Paper Trading
10. Repository
11. API
12. Backtest Jev x Baseline

## Desenvolvimento
cp .env.example .env
npm install
npm run build
docker compose up -d --build

Health:
GET /health

O MVP não executa ordens reais.

## Online analysis, provenance and Gemini

The product layer exposes:
- `POST /api/online-analysis` for the complete online pipeline: quantitative decision, point-in-time research, persisted snapshot and provenance packet.
- `GET /api/ai/providers` for configured AI provider status without exposing secrets.

Gemini is integrated through a provider-agnostic interface. The deterministic quantitative decision remains authoritative; Gemini only adds contextual narrative, risk flags and watch items.

Configuration:
```env
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemini-3.8-flash
GEMINI_API_BASE=https://generativelanguage.googleapis.com/v1beta
GEMINI_TIMEOUT_MS=30000
```

The current Gemini adapter uses the official REST `generateContent` API and structured JSON output. See the Google Gemini API documentation for the current API contract and model availability. The default model in this project is `gemini-3.8-flash`.

The dashboard at `/` now surfaces decision state, market-data freshness, snapshot provenance, packet identity and optional Gemini contextual analysis.

## Quantitative quality cockpit

The product dashboard also exposes `GET /api/evaluation/overview`, which consolidates decision-quality KPIs, confidence calibration and recent OOS validation-gate audits for the selected asset/timeframe. This layer is diagnostic/governance-only: it does not alter strategy thresholds or produce a new trading signal.

## Portfolio governance overview

The product API exposes `GET /api/evaluation/portfolio-overview?fromRun=<walk-forward-run-id>` to consolidate account-level portfolio walk-forward validation and regime diagnostics. This layer is read-only/diagnostic and does not select a preferred strategy or alter trading rules.
