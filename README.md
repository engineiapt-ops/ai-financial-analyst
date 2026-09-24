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
