# PR65 — Release DB Validation Alignment

## Objetivo

Corrigir os dois bloqueios de produção encontrados após a atualização da DATABASE_URL:

1. qualificar dl.ativo e dl.timeframe em getDecisionKpis(), evitando ambiguidade no JOIN com research_snapshots;
2. alinhar research_snapshots.decision_log_id com decision_log.id (BIGINT) por migration explícita e fail-closed.

## Guardrails

- Sem alteração de estratégia.
- Sem alteração de thresholds.
- Sem alteração de sizing.
- Sem alteração de execução.
- Sem alteração do contrato de paper trading.
- Nenhuma ordem real é criada.

## Migration

018_align_research_snapshot_decision_log_type.sql:

- rejeita valores não numéricos;
- rejeita referências para decision_log inexistentes;
- remove FKs existentes sobre a coluna;
- converte a coluna para BIGINT;
- recria a FK para decision_log(id) com ON DELETE SET NULL;
- garante índice em decision_log_id.

## Revalidação obrigatória após merge

1. npm run build
2. npm test
3. npm run release:gate
4. npm run db:migrate contra a DATABASE_URL de Production
5. redeploy Production
6. verificar:
   - /health
   - /api/system/readiness
   - /api/evaluation/operational-quality
   - /api/system/validation

A validação de paper trading só pode avançar se os endpoints críticos deixarem de apresentar os erros SQL observados neste diagnóstico.
