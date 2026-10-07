# YEAR95 — Auditoria da Base de Referência

Fonte auditada: engineiapt-ops/ai-financial-analyst
Head: e539b1583276c40b6793986d947134e82921ca74

## Inventário
Arquivos versionados aproximados: 300
Arquivos dentro de src: 239
Migrações SQL: 23

## Distribuição de src por domínio
| Domínio | Arquivos |
|---|---:|
| marketdata | 43 |
| product | 29 |
| evaluation | 24 |
| api | 14 |
| papertrading | 10 |
| options | 9 |
| research | 9 |
| db | 8 |
| quant | 7 |
| signals | 7 |
| ai | 6 |
| broker | 6 |
| config | 6 |
| instruments | 6 |
| risk | 6 |
| root | 5 |
| backtest | 5 |
| components | 5 |
| portfolio | 5 |
| views | 5 |
| decision | 4 |
| features | 4 |
| online | 4 |
| utils | 3 |
| data | 2 |
| jev | 2 |
| legacy | 2 |
| app | 1 |
| domain | 1 |
| types | 1 |

## Base que será aproveitada
- marketdata: providers, normalization, quality, provenance, point-in-time, integration e backfill;
- instruments: registry e provider mapping;
- quant: price action, risk/reward e position sizing;
- risk: engine e regime;
- signals: confluence e executable signal;
- papertrading: validation, simulator, execution model e cycles;
- evaluation: calibration, KPIs, outcomes, OOS, governance e audit;
- ai: provider abstraction e Gemini;
- backtest: benchmark, baseline, JEV e walk-forward;
- portfolio: engine e walk-forward portfolio;
- research: snapshots, reporting e intelligence;
- options: pricing, volatility e barriers;
- broker/Saxo e market-data/IG para fases posteriores;
- API security/observability/config para a fundação;
- frontend atual como referência visual e de comportamento, não como cópia arquitetural.

## Conclusão da auditoria
A base técnica é suficientemente rica para sustentar a nova plataforma. O problema da fonte não é falta de capacidade funcional; é o acúmulo de caminhos históricos, compatibility facades, scripts e responsabilidades cruzadas.

Portanto, a estratégia YEAR95 é reconstrução seletiva: comportamento validado entra como contrato; implementação problemática é reescrita.