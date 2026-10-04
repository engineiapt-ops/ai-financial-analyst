# Arquitetura do AI Financial Analyst

## Produto principal

O produto quantitativo é o núcleo principal do sistema. Ele deve produzir decisões determinísticas **BUY / SELL / WAIT**, com dados de mercado, níveis de execução, risco, paper trading, avaliação OOS e trilha de auditoria.

O núcleo não envia ordens reais.

## Superfície quantitativa atual

- Decision Engine determinístico como autoridade.
- Timeframes atuais: 1h, 4h e 1d.
- Market data atualmente baseada em Binance Spot/BTCUSDT.
- JEV e Gemini são componentes consultivos dentro dos contratos existentes; não substituem a decisão determinística.
- Paper trading e avaliações walk-forward/OOS permanecem separados de execução real.

## Analista de ações legado

As rotas de analista fundamentalista, DCF, ledger, briefing e co-pilot existentes em server.ts são consideradas superfície legada.

Elas ficam **desabilitadas por padrão** por ENABLE_STOCK_ANALYST=false. Para reativação deliberada, a variável deve ser explicitamente definida como true.

Rotas isoladas:

- /api/market/overview
- /api/analyze/ticker
- /api/analyze/ledger
- /api/valuation/dcf
- /api/research/memo
- /api/briefing/tts
- /api/copilot/chat

A antiga /api/market/overview continha números estáticos e não representa uma fonte de mercado confiável. Com a flag padrão desligada, ela não é apresentada como dado ao vivo.

## Princípios

1. Não apresentar números estáticos como dados de mercado.
2. Não misturar a superfície legada com o cockpit quantitativo.
3. Não apagar a funcionalidade legada antes de mapear dependências.
4. Contratos existentes continuam versionados; mudanças incompatíveis exigem nova versão.
5. Segredos permanecem em variáveis de ambiente/secrets.
6. Nenhuma alteração de Fase 0 deve introduzir execução real.
7. Evoluções CFD seguem PRs pequenos e independentes.

## Próxima etapa

A Fase 1 adicionará o registro de instrumentos CFD e removerá dependências fixas de BTCUSDT apenas quando os metadados da corretora e os instrumentos alvo estiverem confirmados.