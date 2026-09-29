# Decision KPI SQL Fix — PR #59

## Objetivo

Corrigir a consulta de KPIs de decisão para funcionar com o `LEFT JOIN` entre
`decision_log` e `research_snapshots`.

## Causa

Após o alinhamento do tipo de `research_snapshots.decision_log_id`, os endpoints de
qualidade operacional e validação passaram a executar a consulta com as duas tabelas.
Filtros sem qualificação, como `ativo`, `timeframe` e `origem`, ficaram ambíguos porque
as tabelas possuem colunas com esses nomes.

O erro observado em produção foi:

`column reference "ativo" is ambiguous`

## Correção

Os filtros de `getDecisionKpis()` agora qualificam explicitamente as colunas da tabela
`decision_log` com o alias `dl`:

- `dl.ativo`
- `dl.timeframe`
- `dl.origem`
- `dl.recomendacao`
- `dl.decision_at`

O filtro de regime já utilizava explicitamente `rs.snapshot`.

## Escopo e guardrails

- Nenhuma migration nova.
- Nenhuma alteração de estratégia.
- Nenhuma alteração de thresholds.
- Nenhuma alteração de sizing.
- Nenhuma alteração de execução de ordens.
- Nenhuma alteração no contrato do Decision Engine.
- Correção localizada exclusivamente na consulta de KPIs e em sua regressão.

## Validação

A suíte de repositório inclui uma regressão que verifica a qualificação dos seis filtros
dinâmicos. Após o merge/deploy, os endpoints de produção devem ser revalidados:

1. `/health`
2. `/api/evaluation/operational-quality`
3. `/api/system/validation`

Somente com os endpoints operacionais sem erro deve-se avançar para a próxima etapa de
validação controlada de paper trading.