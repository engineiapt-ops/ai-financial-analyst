import React from 'react';
import { MarketIndex } from '../types';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TickerTapeProps {
  indices: MarketIndex[];
  source?: string;
}

export const TickerTape: React.FC<TickerTapeProps> = ({ indices, source }) => {
  return (
    <div className="w-full bg-slate-950 border-b border-slate-900 py-1.5 px-4 overflow-hidden select-none">
      <div className="flex items-center space-x-8 animate-marquee whitespace-nowrap text-xs">
        {source === 'static-demo' && (
          <span className="inline-flex items-center rounded border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Dados ilustrativos
          </span>
        )}
        {indices.concat(indices).map((item, idx) => {
          const isPos = item.change >= 0;
          return (
            <div key={`${item.symbol}-${idx}`} className="inline-flex items-center space-x-2 font-mono">
              <span className="font-semibold text-slate-300">{item.symbol}</span>
              <span className="text-white">
                {item.isYield ? `${item.price.toFixed(2)}%` : item.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
              <span className={`inline-flex items-center text-[11px] font-semibold ${isPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isPos ? <TrendingUp className="h-3 w-3 mr-0.5 inline" /> : <TrendingDown className="h-3 w-3 mr-0.5 inline" />}
                {isPos ? '+' : ''}{item.changePercent.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
