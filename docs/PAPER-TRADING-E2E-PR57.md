# PR 57 — Controlled End-to-End Paper Trading Validation

## Objective

Prove, in one deterministic controlled scenario, that the release path preserves the selected artifacts from decision through paper execution, settlement, provenance and validation history.

## Scope

- Asset: BTCUSDT
- Timeframe: 1h
- Execution: paper only
- Decision authority: deterministic Decision Engine
- AI/JEV: advisory input only
- Position sizing: fixed 1.5%
- Risk maximum gross exposure: 15%
- Execution model: v2
- Settlement source: closed persisted market-data evidence

## Scenario

1. A deterministic JEV response produces BUY with sufficient confidence/probability and no elevated risk.
2. Risk accepts the decision at the fixed 1.5% position size.
3. A persisted decision record is evaluated only against future closed candles.
4. The paper execution model reaches the target on the first future candle.
5. Settlement generates an immutable audit payload with market-data and evidence SHA-256 hashes.
6. The exact decision, paper-trade and settlement artifacts are restored from controlled persistence without mutation.
7. Validation history records the resulting operational state and evidence hash.

## Required invariants

- No real-order API is called.
- No threshold or sizing mutation occurs.
- Future candles are not used before their close.
- Settlement uses the exact future candle set selected by the deterministic evaluator.
- Paper execution remains v2.
- Risk remains at or below the fixed position size and 15% gross exposure ceiling.
- Settlement and validation evidence hashes are valid SHA-256 values.
- Validation history remains temporally ordered and scope-consistent.

## Evidence

The executable scenario is src/product/paperTradingE2E.test.ts.

This test is intentionally deterministic and self-contained. Its persistence section uses a controlled in-memory artifact store to verify artifact preservation and provenance without requiring production credentials or external services. It is therefore an operational validation of the release path, not a claim that a live production database or exchange order was exercised.

## Exit criteria for PR 57

PR 57 is considered complete when:

- the controlled E2E test passes;
- build passes;
- aggregate tests pass;
- release gate remains ready;
- CI passes on the PR commit.

This validation does not authorize real execution and is not an investment verdict.
