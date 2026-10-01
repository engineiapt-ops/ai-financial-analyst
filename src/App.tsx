import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { TickerTape } from './components/TickerTape';
import { AudioBriefingModal } from './components/AudioBriefingModal';
import { ResearchMemoModal } from './components/ResearchMemoModal';
import { CopilotDrawer } from './components/CopilotDrawer';
import { TickerAnalysisView } from './views/TickerAnalysisView';
import { LedgerAuditView } from './views/LedgerAuditView';
import { DCFValuationView } from './views/DCFValuationView';
import { PortfolioOptimizerView } from './views/PortfolioOptimizerView';
import { MarketOverviewView } from './views/MarketOverviewView';
import { preloadedStocks } from './data/preloadedStocks';
import { apiFetch, ApiFetchError } from './utils/apiFetch';
import { TickerAnalysis, MarketOverviewData } from './types';
import { Loader2, Sparkles, TrendingUp, AlertCircle } from 'lucide-react';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'ticker' | 'ledger' | 'dcf' | 'portfolio' | 'market'>('ticker');
  const [selectedTicker, setSelectedTicker] = useState<string>('NVDA');
  const [currentAnalysis, setCurrentAnalysis] = useState<TickerAnalysis>(preloadedStocks['NVDA']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Drawers
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [isCopilotOpen, setIsCopilotOpen] = useState(false);

  // Market overview state
  const [marketData, setMarketData] = useState<MarketOverviewData>({
    indices: [
      { symbol: 'S&P 500', price: 5864.67, change: 24.38, changePercent: 0.42, high: 5878.12, low: 5845.20 },
      { symbol: 'NASDAQ', price: 18518.61, change: 142.15, changePercent: 0.77, high: 18560.40, low: 18410.90 },
      { symbol: 'DOW JONES', price: 42387.57, change: -78.20, changePercent: -0.18, high: 42520.10, low: 42310.80 },
      { symbol: '10Y TREASURY', price: 4.18, change: 0.04, changePercent: 0.96, high: 4.22, low: 4.14, isYield: true },
      { symbol: 'VIX VOLATILITY', price: 15.42, change: -0.88, changePercent: -5.40, high: 16.90, low: 15.20 }
    ],
    macro: {
      fedRate: '4.75% - 5.00%',
      inflationRate: '2.4%',
      gdpGrowth: '2.8% QoQ',
      unemployment: '4.1%',
      oilWTI: '$71.45/bbl',
      gold: '$2,658.20/oz'
    },
    featuredTickers: ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'BRK.B']
  });

  useEffect(() => {
    // Fetch live market data on initial load
    apiFetch('/api/market/overview')
      .then(res => res.json())
      .then(data => {
        if (data.indices) setMarketData(data);
      })
      .catch(err => {
        if (err instanceof ApiFetchError && (err.status === 401 || err.status === 503)) {
          setError(err.message);
          return;
        }
        console.warn('Using fallback market overview:', err);
      });
  }, []);

  const handleSearchTicker = async (ticker: string) => {
    const formattedTicker = ticker.toUpperCase().trim();
    setSelectedTicker(formattedTicker);
    setError(null);

    // If already preloaded and cached
    if (preloadedStocks[formattedTicker]) {
      setCurrentAnalysis(preloadedStocks[formattedTicker]);
      return;
    }

    // Call server-side Gemini search grounded analysis
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/analyze/ticker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: formattedTicker })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || `Failed to analyze ticker ${formattedTicker}`);
      }

      setCurrentAnalysis(data.data);
    } catch (err: any) {
      console.error('Ticker search error:', err);
      setError(err.message || `Unable to fetch fundamental data for ${formattedTicker}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 font-sans">
      {/* Ticker Marquee */}
      <TickerTape indices={marketData.indices} />

      {/* Main App Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        selectedTicker={selectedTicker}
        onSearchTicker={handleSearchTicker}
        isLoading={isLoading}
        onOpenAudioBriefing={() => setIsAudioModalOpen(true)}
        onOpenResearchMemo={() => setIsMemoModalOpen(true)}
        onToggleCopilot={() => setIsCopilotOpen(prev => !prev)}
        isCopilotOpen={isCopilotOpen}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 relative">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {isLoading ? (
          <div className="py-28 flex flex-col items-center justify-center text-center space-y-4">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-2 border-emerald-500/20 border-t-emerald-500 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-emerald-400 animate-pulse" />
              </div>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Analyzing Financial Filings for {selectedTicker}...</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md">
                Decomposing DuPont ratios, structuring segment revenues, calculating valuation multiples, and synthesizing risk catalysts.
              </p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'ticker' && (
              <TickerAnalysisView
                data={currentAnalysis}
                onOpenDCFWithCurrent={() => setActiveTab('dcf')}
                onOpenBriefing={() => setIsAudioModalOpen(true)}
                onOpenMemo={() => setIsMemoModalOpen(true)}
              />
            )}

            {activeTab === 'ledger' && (
              <LedgerAuditView />
            )}

            {activeTab === 'dcf' && (
              <DCFValuationView
                ticker={selectedTicker}
                defaultPrice={currentAnalysis.currentPrice}
              />
            )}

            {activeTab === 'portfolio' && (
              <PortfolioOptimizerView />
            )}

            {activeTab === 'market' && (
              <MarketOverviewView
                marketData={marketData}
                onSelectTicker={(t) => {
                  handleSearchTicker(t);
                  setActiveTab('ticker');
                }}
              />
            )}
          </>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>AI Financial Analyst • Institutional Equity Intelligence & Forensic Audit Platform</span>
          <span className="font-mono text-[11px] text-slate-600">Grounded in SEC 10-K/10-Q & Realtime Multiples</span>
        </div>
      </footer>

      {/* Audio Executive Briefing Modal */}
      <AudioBriefingModal
        isOpen={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
        defaultText={currentAnalysis?.executiveSummary || `Analysis for ${selectedTicker}`}
        ticker={selectedTicker}
      />

      {/* Institutional Research Memo Modal */}
      <ResearchMemoModal
        isOpen={isMemoModalOpen}
        onClose={() => setIsMemoModalOpen(false)}
        ticker={selectedTicker}
        companyName={currentAnalysis?.companyName || selectedTicker}
      />

      {/* Interactive AI Financial Co-pilot Drawer */}
      <CopilotDrawer
        isOpen={isCopilotOpen}
        onClose={() => setIsCopilotOpen(false)}
        activeContext={currentAnalysis}
        ticker={selectedTicker}
      />
    </div>
  );
};

export default App;
