# Plano de Ativação — AI Financial Analyst (Uso Pessoal)

**Objetivo:** Tornar o sistema o mais assertivo possível em paper trading, alimentá-lo com dados reais e só depois considerar dinheiro real.

**Versão:** `0.1.3-personal` (modo validação — evidência da estratégia deve ser gerada do zero)

---

## Ordem recomendada de execução

### 1. Preparar o ambiente (obrigatório)

```bash
cp .env.example .env
# Edite o .env e preencha pelo menos:
#   DATABASE_URL=...
#   API_AUTH_TOKEN=...   (qualquer string forte)
```

Depois:

```bash
npm install
npm run db:migrate
```

---

### 2. Alimentar com dados históricos (prioridade máxima)

```bash
# Todos os timeframes de uma vez (defaults recomendados)
npm run backfill:all

# Ou individualmente:
npm run market:backfill -- --symbol BTCUSDT --timeframe 1h
npm run market:backfill -- --symbol BTCUSDT --timeframe 4h
npm run market:backfill -- --symbol BTCUSDT --timeframe 1d
```

**Defaults atuais:**
- 1h → 8000 candles (~11 meses)
- 4h → 4000 candles (~1.8 anos)
- 1D → 1500 candles (~4 anos)

---

### 3. Congelar as regras de decisão (anti-overfit)

Thresholds padrão (mais seletivos para uso pessoal):

| Parâmetro              | Valor padrão | Significado                          |
|------------------------|--------------|--------------------------------------|
| minConfidence          | 0.68         | Confiança mínima para BUY/SELL       |
| minProbabilidade       | 0.62         | Probabilidade mínima da direção      |
| bloquearSeRiscoElevado | true         | Risco elevado → força WAIT           |
| FIXED_POSITION_PCT     | 1.5          | % do capital por operação            |

O walk-forward já chama `freezeThresholds()` automaticamente.
**Não altere esses valores** depois de começar validação séria.

Podem ser ajustados via `.env` **antes** do primeiro freeze (ver `.env.example`).

---

### 4. Rodar a primeira validação séria

```bash
npm run backtest:walk-forward
```

Avalie:
- Win rate e expectancy por timeframe
- Estabilidade entre folds
- Resultado do OOS Validation Gate
- Drawdown e consistência

---

### 5. Ativar paper trading contínuo

Depois que walk-forward + OOS gate darem sinais aceitáveis:
- Suba a API (`npm run dev` ou Docker)
- Deixe gerar decisões em tempo real (paper only)
- Acumule histórico e monitore o cockpit de qualidade

---

### 6. Critérios mínimos para “base sólida” (antes de dinheiro real)

- [ ] Dados históricos suficientes nos 3 timeframes
- [ ] Thresholds congelados
- [ ] Walk-forward executado
- [ ] OOS Gate passando de forma consistente
- [ ] Paper trading rodando por período relevante
- [ ] Expectancy positiva e estável
- [ ] Drawdown controlado
- [ ] Nenhum sinal claro de overfit

---

## Regras de ouro (paper)

1. Decision Engine determinístico é a autoridade. Gemini é só contexto.
2. Nunca mude thresholds depois de congelar.
3. Prefira WAIT a forçar operação.
4. Só opere com dinheiro real depois do checklist acima.
5. Documente dataset hash, runs e gates.

---

## Comandos úteis

```bash
npm run db:migrate          # aplica schema + migrations
npm run backfill:all        # baixa 1h + 4h + 1D
npm run backtest:walk-forward
npm run dev                 # API em modo desenvolvimento
npm test                    # suite completa
npm run release:gate        # gate de release / governança
```

---

**Próximo passo imediato:** configurar `.env` → `npm install` → `npm run db:migrate` → `npm run backfill:all`
