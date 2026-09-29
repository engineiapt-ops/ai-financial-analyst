# PR 58 — Operational / Release Hardening

## Objetivo

Fechar os controles operacionais necessários para a entrada em **controlled paper trading**, sem adicionar funcionalidades de estratégia ou execução real.

## Alterações

### Release Gate reforçado

O release gate agora exige que o `npm test` agregado contenha explicitamente:

- system readiness;
- system validation;
- outcome settlement audit;
- validation history;
- controlled paper-trading E2E;
- runtime configuration;
- authentication;
- rate limiting;
- observability;
- API integration;
- point-in-time validation;
- market-data quality;
- Decision Engine;
- risk;
- paper trading.

Isso impede que uma alteração futura remova silenciosamente uma suíte crítica do agregado e ainda deixe o release gate estruturalmente verde.

### O que não foi alterado

- estratégia;
- thresholds;
- position sizing;
- Decision Engine authority;
- JEV/JEVY/Gemini advisory model;
- execução real;
- escopo BTCUSDT / 1h / 4h / 1d;
- modelo de paper execution v2.

## Checklist de release

### Local / CI

1. `npm install`
2. `npm run build`
3. `npm test`
4. `npm run release:gate`

Os quatro precisam terminar sem erro.

### Produção / Vercel

Confirmar manualmente no ambiente de produção:

- `DATABASE_URL` configurada;
- `API_AUTH_TOKEN` configurada;
- `NODE_ENV`/Vercel em modo de produção;
- configuração de região/deployment válida;
- `/health` respondendo;
- API protegida nos endpoints sensíveis;
- logs sem exposição de secrets;
- nenhuma configuração habilitando execução real.

### Evidência operacional

Antes de iniciar paper trading controlado:

- controlled E2E aprovado;
- CI verde no commit de release;
- release gate verde;
- configuração de produção validada;
- walk-forward/OOS de referência registrado;
- validation history inicial registrada;
- settlement audit disponível para decisões finalizadas.

## Critério de saída

PR 58 está pronto quando:

- build passa;
- suíte agregada passa;
- release gate passa;
- CI passa;
- configuração operacional de produção é conferida;
- não existe blocker residual concreto.

Este documento não autoriza execução financeira real e não constitui avaliação de investimento.
