# Ajustes para uso pessoal

## v0.1.3-personal — modo validação (consistência de evidência)

Sem feature nova de estratégia. Apenas correções para evidência reproduzível.

### Correções
1. **Item A (crítico):** `getLevels()` alinhado aos mesmos `%` do `simulateTrade` / `decision_log` em `run.ts`, `remoteBaseline.ts`, `remoteJev.ts`.
2. **Fonte única de execução:** `executionLevels.ts` expõe `priceLevelsFromPct` + `resolvePriceLevels`; runners de backtest usam ATR (ou fallback) de forma uniforme.
3. **benchmark.ts** também usa `executionLevels` (não mais target/stop fixos isolados no trade).
4. **Metadados:** referências `risk-engine-v1` → `risk-engine-v2` em walk-forward notes, portfolio report, fixtures e repository test.
5. **Testes no aggregate:** `test:execution-levels` e `test:risk` entram no `npm test`.

### Não alterado nesta versão
- Baseline rules, thresholds, sizing defaults
- Risk engine behavior (já v2)
- Migrations 001–017
- Governança / release-gate / paper-only

### Próximo ciclo (na sua máquina)
```
npm install → build → test → release:gate → db:migrate → backfill:all → freeze → walk-forward → OOS → paper contínuo
```

---

## v0.1.2-personal — melhorias de assertividade no código

### 1. Baseline Engine mais seletivo
- VWAP, RSI em zona, lateral filter, ATR por timeframe

### 2. Position sizing dinâmico
- Base 1.5%, redução sob stress de ATR

### 3. Target / Stop por ATR + timeframe
- Módulo `executionLevels.ts`

### 4. Risk engine v2
- Alinhado a FIXED_POSITION_PCT, exposição 15%

---

## v0.1.1-personal — setup pessoal

- Thresholds 0.68 / 0.62, backfill:all, PLANO-ATIVACAO.md
