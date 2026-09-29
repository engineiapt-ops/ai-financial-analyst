export interface TargetPrice {
  bull: number;
  base: number;
  bear: number;
}

export interface DupontAnalysis {
  netProfitMargin: number;
  assetTurnover: number;
  financialLeverage: number;
  roe: number;
}

export interface KeyRatios {
  grossMargin: number;
  operatingMargin: number;
  freeCashFlowYield: number;
  currentRatio: number;
  quickRatio: number;
  debtToEquity: number;
  interestCoverage: number;
  fcfConversion: number;
}

export interface HistoricalPerformance {
  year: string;
  revenue: number;
  netIncome: number;
  fcf: number;
  grossMargin: number;
  opMargin: number;
}

export interface SegmentBreakdown {
  segment: string;
  revenuePct: number;
  growthRate: number;
  details: string;
}

export interface Catalyst {
  catalyst: string;
  timeline: string;
  impact: 'High' | 'Medium' | 'Low';
}

export interface TickerAnalysis {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  currentPrice: number;
  marketCap: string;
  peRatio: number;
  forwardPE: number;
  pegRatio: number;
  evToEbitda: number;
  priceToSales: number;
  priceToBook: number;
  dividendYield: number;
  beta: number;
  executiveSummary: string;
  financialHealthScore: number;
  moatRating: 'Wide' | 'Narrow' | 'None';
  valuationVerdict: 'Strong Buy' | 'Buy' | 'Hold' | 'Underperform' | 'Sell';
  targetPrice12M: TargetPrice;
  dupontAnalysis: DupontAnalysis;
  keyRatios: KeyRatios;
  historicalPerformance: HistoricalPerformance[];
  segmentBreakdown: SegmentBreakdown[];
  swot: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
  bullCase: string[];
  bearCase: string[];
  catalysts: Catalyst[];
  accountingRedFlags: string[];
}

export interface ForensicAnomaly {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  affectedAmount: number;
  account: string;
  dateOrRef: string;
  forensicReasoning: string;
  recommendation: string;
}

export interface CategorizedAccount {
  category: 'Revenue' | 'COGS' | 'OpEx' | 'Current Assets' | 'Fixed Assets' | 'Liabilities' | 'Equity';
  accountName: string;
  amount: number;
  transactionCount: number;
}

export interface LedgerAuditResult {
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    operatingExpenses: number;
    costOfGoodsSold: number;
    grossProfit: number;
    netIncome: number;
    grossMarginPct: number;
    netMarginPct: number;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
    balanceDiscrepancy: number;
  };
  categorizedAccounts: CategorizedAccount[];
  burnAndRunway: {
    monthlyBurnRate: number;
    estimatedCashRunwayMonths: number;
    workingCapital: number;
    quickRatio: number;
  };
  forensicAnomalies: ForensicAnomaly[];
  taxAndComplianceRisks: string[];
  controllerAuditOpinion: 'Unqualified (Clean)' | 'Qualified' | 'Adverse' | 'Disclaimer of Opinion';
  auditExecutiveNotes: string;
}

export interface DCFForecastYear {
  year: string;
  projectedRevenue: number;
  projectedFCF: number;
  discountFactor: number;
  pvOfFCF: number;
}

export interface SensitivityRow {
  wacc: string;
  [key: string]: string | number;
}

export interface DCFModelResult {
  forecast: DCFForecastYear[];
  cumulativePvFCF: number;
  terminalValueGordon: number;
  pvTerminalValueGordon: number;
  enterpriseValueGordon: number;
  equityValueGordon: number;
  fairValuePerShareGordon: number;
  terminalValueMultiple: number;
  pvTerminalValueMultiple: number;
  fairValuePerShareMultiple: number;
  blendedFairValue: number;
  upsideDownsidePct: number;
  valuationMarginOfSafety: number;
  sensitivityMatrix: SensitivityRow[];
  analystVerdict: 'Significantly Undervalued' | 'Moderately Undervalued' | 'Fairly Valued' | 'Moderately Overvalued' | 'Significantly Overvalued';
  commentary: string;
}

export interface MarketIndex {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  isYield?: boolean;
}

export interface MacroIndicator {
  fedRate: string;
  inflationRate: string;
  gdpGrowth: string;
  unemployment: string;
  oilWTI: string;
  gold: string;
}

export interface MarketOverviewData {
  indices: MarketIndex[];
  macro: MacroIndicator;
  featuredTickers: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  sources?: any[];
}
