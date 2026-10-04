# Plano de alinhamento CFD

## Objetivo
Preparar o AI Financial Analyst para operação horária em CFDs com sinais semiautomáticos para um humano executar na plataforma da corretora. Nenhuma ordem real será enviada pelo sistema.

## Estado de referência
Base: main após o merge do PR #108. O núcleo atual permanece determinístico, com decisão BUY/SELL/WAIT, timeframes 1h/4h/1d, ATR para níveis de execução, paper trading, walk-forward/OOS, auditoria e governança. A fonte atual é Binance Spot/BTCUSDT e os custos atuais ainda são cripto; não devem ser tratados como custos de CFD.

## Parâmetros provisórios
Os valores abaixo são defaults conservadores para planejamento e devem ser confirmados antes das fases específicas da corretora.

| Parâmetro | Valor provisório | Estado |
|---|---|---|
| Corretora alvo | IG | CONFIRMAR |
| Instrumentos | EURUSD, US500, BTC/USD CFD | CONFIRMAR |
| Tipo de conta | demo | FIXO até os gates da Fase 7 |
| Moeda | EUR | CONFIRMAR |
| Capital simulado | €1.000 | CONFIRMAR |
| Risco máximo/operação | 0,5% | CONSERVADOR / CONFIRMAR |
| Perda máxima diária | 2% | CONSERVADOR / CONFIRMAR |
| Horário | 08:00–22:00 Europe/Lisbon | CONFIRMAR com horário dos instrumentos |

Nenhum spread, margem, financiamento, tamanho mínimo, passo ou horário específico será inventado. Esses valores devem vir da documentação/plataforma da corretora ou permanecer como TODO_CONFIRMAR_NA_CORRETORA.

## Regras
1. Nenhuma ordem real será implementada.
2. Decision Engine determinístico permanece autoritativo; IA/Gemini é consultiva.
3. Thresholds e modelos são versionados; alterações criam nova versão e exigem OOS novo.
4. Apenas candles fechados e dados point-in-time podem gerar sinais.
5. Cada fase operacional será um PR separado.
6. npm run release:gate deve passar no CI antes do merge.
7. Contratos *.v1 existentes não serão quebrados; mudanças incompatíveis criam *.v2.
8. Segredos somente em secrets/variáveis de ambiente.
9. Validação somente pelo GitHub Actions, sem terminal local.
10. Bugs do núcleo serão tratados em PR separado da evolução CFD.

## Fase 0 — separar produtos e remover dados falsos
**Objetivo:** deixar o cockpit quantitativo como produto principal e impedir dados estáticos como se fossem ao vivo.

**Alvos:** server.ts e integrações legadas; views de ticker/DCF/ledger/portfolio; /api/market/overview; preloadedStocks/mockLedger; src/types.ts e src/types/index.ts; lockfiles; documentação; novo docs/ARQUITETURA.md.

**Estratégia:** isolar o analista de ações atrás de ENABLE_STOCK_ANALYST=false por padrão ou movê-lo para área legada, sem apagar funcionalidade antes de mapear dependências. Remover números falsos da superfície principal.

**Aceite:** UI inicial sem números estáticos, CI verde e arquitetura documentada.

## Fase 1 — registro de instrumentos CFD
Criar src/instruments/registry.ts e db/migrations/022_instruments.sql; remover BTCUSDT fixo de cron/workflow/backfill/docs; adicionar testes de registro e sizing mínimo/passo. Metadados IG/XTB devem vir de fonte oficial.

**Aceite:** novo instrumento por configuração e decisão vinculável à versão exata do registro.

## Fase 2 — provider de preços alinhado à corretora
Criar PriceProvider em src/marketdata/providers/, começar por CsvPriceProvider e só depois implementar IG/XTB após verificar API, conta, limites e histórico. Guardar bid/ask e estender quality checks.

**Aceite:** histórico por instrumento/provider, bid/ask quando disponível, timezone validado e fixtures sem rede.

## Fase 3 — execution-model v3 para CFD
Novo modelo versionado com bid/ask, spread, comissão, slippage, financiamento overnight, gaps, margem/alavancagem, stop-out e janelas. Stop vence se alvo e stop ocorrerem no mesmo candle. O modelo anterior deve continuar reproduzível.

## Fase 4 — RiskEngine v2
Risco por operação, perda diária máxima, limite de operações, posições simultâneas, exposição, correlação, pausa após perdas e bloqueios de eventos quando houver fonte confiável. Sizing deriva de risco monetário/distância ao stop.

## Fase 5 — sinais horários executáveis
Ciclo por instrumento/horário, somente candle fechado, idempotência por instrumento/timeframe/data_as_of, ticket completo com entrada bid/ask, stop, alvo, tamanho, risco, spread, custos e validade. Agendador externo principal, GitHub Actions reserva, alerta de atraso e notificação humana. Nenhuma ordem será enviada.

## Fase 6 — avaliação honesta
Métricas líquidas de custos, expectância e intervalo de confiança; baselines buy-and-hold, sempre WAIT e baseline sem Jev; stress de custos +25/+50/+100%; walk-forward por instrumento e mínimo configurável de trades OOS.

## Fase 7 — promotion gate
Criar promotion-gate.v1. Critérios: amostra OOS, expectância líquida com IC, stress de custos, drawdown, paper em tempo real e confiabilidade operacional. O estágio final apenas libera tickets para ação humana; não existe caminho de envio automático.

## Fase 8 — dívida técnica
Depois da funcionalidade CFD estabilizada: quebrar routers/repositórios grandes, rate limit distribuído, revisar ledger e fixar dependências.

## Dependências antes da Fase 1
Confirmar corretora, instrumentos, moeda/capital, horários, acesso demo e documentação oficial de metadados/spread/margem/financiamento.

## Validação
Cada PR deverá passar no CI por npm run lint, npm run build, npm test e npm run release:gate.

## Infraestrutura
A migração de hospedagem para Oracle/alternativa continua separada das Fases CFD. A Vercel permanece fallback até a nova infraestrutura passar os testes.

## Resultado esperado
Ao final da Fase 7, o sistema produzirá sinais CFD auditáveis para execução manual, com custos realistas, risco, evidência OOS e gates de promoção. Sem promessa de lucro diário e sem execução automática.
