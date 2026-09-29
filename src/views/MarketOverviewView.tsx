import React from 'react';
import { MarketOverviewData } from '../types';
import {
  Globe,
  TrendingUp,
  TrendingDown,
  Percent,
  Activity,
  DollarSign,
  Flame,
  Layers,
  ArrowUpRight
} from 'lucide-react';

interface MarketOverviewViewProps {
  marketData: MarketOverviewData;
  onSelectTicker: (ticker: string) => void;
}

export const MarketOverviewView: React.FC<MarketOverviewViewProps> = ({
  marketData,
  onSelectTicker
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="terminal-card rounded-2xl p-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 border border-teal-500/20">
            <Globe className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              Macroeconomic Pulse & Cross-Asset Market Dashboard
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/30">
                Global Feed
              </span>
            </h1>
            <p className="text-xs text-slate-400">
              Real-time benchmark index performance, sovereign yields, inflation print, and key liquidity indicators.
            </p>
          </div>
        </div>
      </div>

      {/* Macro Indicators */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
        <div className="terminal-card rounded-xl p-3.5">
          <span className="text-slate-500 text-[10px] font-semibold block uppercase">Fed Funds Rate</span>
          <span className="text-lg font-mono font-black text-white">{marketData.macro.fedRate}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">FOMC Target Band</span>
        </div>

        <div className="terminal-card rounded-xl p-3.5">
          <span className="text-slate-500 text-[10px] font-semibold block uppercase">CPI Inflation</span>
          <span className="text-lg font-mono font-black text-teal-400">{marketData.macro.inflationRate}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">YoY Headline</span>
        </div>

        <div className="terminal-card rounded-xl p-3.5">
          <span className="text-slate-500 text-[10px] font-semibold block uppercase">GDP Growth</span>
          <span className="text-lg font-mono font-black text-emerald-400">{marketData.macro.gdpGrowth}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Real Annualized</span>
        </div>

        <div className="terminal-card rounded-xl p-3.5">
          <span className="text-slate-500 text-[10px] font-semibold block uppercase">Unemployment</span>
          <span className="text-lg font-mono font-black text-white">{marketData.macro.unemployment}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">U3 Labor Dept</span>
        </div>

        <div className="terminal-card rounded-xl p-3.5">
          <span className="text-slate-500 text-[10px] font-semibold block uppercase">WTI Crude Oil</span>
          <span className="text-lg font-mono font-black text-amber-400">{marketData.macro.oilWTI}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Energy Benchmark</span>
        </div>

        <div className="terminal-card rounded-xl p-3.5">
          <span className="text-slate-500 text-[10px] font-semibold block uppercase">Spot Gold</span>
          <span className="text-lg font-mono font-black text-yellow-400">{marketData.macro.gold}</span>
          <span className="text-[10px] text-slate-400 block mt-0.5">Safe Haven Asset</span>
        </div>
      </div>

      {/* Index Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {marketData.indices.map((idx) => {
          const isPos = idx.change >= 0;
          return (
            <div key={idx.symbol} className="terminal-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-sm">{idx.symbol}</span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${
                  isPos ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                }`}>
                  {isPos ? '+' : ''}{idx.changePercent.toFixed(2)}%
                </span>
              </div>

              <div className="flex items-baseline justify-between font-mono">
                <span className="text-2xl font-black text-white">
                  {idx.isYield ? `${idx.price.toFixed(2)}%` : idx.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <span className={`text-xs font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isPos ? '+' : ''}{idx.change.toFixed(2)} pts
                </span>
              </div>

              <div className="flex justify-between text-[11px] text-slate-500 border-t border-slate-800/80 pt-2 font-mono">
                <span>Day Low: {idx.low.toFixed(2)}</span>
                <span>Day High: {idx.high.toFixed(2)}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Launchpad for Featured Stocks */}
      <div className="terminal-card rounded-2xl p-6">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Flame className="h-4 w-4 text-emerald-400" />
          Featured Equity Deep-Dives
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          {marketData.featuredTickers.map((t) => (
            <button
              key={t}
              onClick={() => onSelectTicker(t)}
              className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900 flex items-center justify-between text-left transition-all group"
            >
              <div>
                <span className="font-mono font-black text-sm text-white group-hover:text-emerald-400 block">${t}</span>
                <span className="text-[10px] text-slate-400">Launch Analyst Deep-Dive</span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
