import { TickerAnalysis } from '../types';

export const preloadedStocks: Record<string, TickerAnalysis> = {
  NVDA: {
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    sector: 'Information Technology',
    industry: 'Semiconductors & AI Hardware',
    currentPrice: 128.50,
    marketCap: '$3.15 Trillion',
    peRatio: 52.4,
    forwardPE: 34.8,
    pegRatio: 1.12,
    evToEbitda: 38.2,
    priceToSales: 26.5,
    priceToBook: 42.1,
    dividendYield: 0.03,
    beta: 1.68,
    executiveSummary: 'NVIDIA maintains near-monopolistic leadership in enterprise AI acceleration with over 85% market share in datacenter GPUs. Blackwell B200 and Ultra architectures solidify sticky CUDA software moat, driving unprecedented operating leverage and free cash flow generation despite rising hyperscaler custom silicon competition.',
    financialHealthScore: 94,
    moatRating: 'Wide',
    valuationVerdict: 'Strong Buy',
    targetPrice12M: {
      bull: 175.00,
      base: 148.00,
      bear: 95.00
    },
    dupontAnalysis: {
      netProfitMargin: 55.6,
      assetTurnover: 1.45,
      financialLeverage: 1.52,
      roe: 122.5
    },
    keyRatios: {
      grossMargin: 75.1,
      operatingMargin: 61.8,
      freeCashFlowYield: 2.85,
      currentRatio: 3.84,
      quickRatio: 3.32,
      debtToEquity: 0.18,
      interestCoverage: 88.4,
      fcfConversion: 82.5
    },
    historicalPerformance: [
      { year: '2021', revenue: 26.91, netIncome: 9.75, fcf: 8.13, grossMargin: 64.9, opMargin: 37.3 },
      { year: '2022', revenue: 26.97, netIncome: 4.37, fcf: 3.81, grossMargin: 56.9, opMargin: 20.9 },
      { year: '2023', revenue: 60.92, netIncome: 29.76, fcf: 27.02, grossMargin: 72.7, opMargin: 54.1 },
      { year: '2024', revenue: 120.8, netIncome: 62.40, fcf: 58.20, grossMargin: 75.5, opMargin: 62.0 },
      { year: '2025E', revenue: 165.0, netIncome: 85.00, fcf: 79.50, grossMargin: 74.8, opMargin: 60.5 }
    ],
    segmentBreakdown: [
      { segment: 'Data Center / AI Compute', revenuePct: 87.2, growthRate: 154.0, details: 'Hopper H100/H200 and Blackwell B200 hyperscaler deployments' },
      { segment: 'Gaming & GeForce GPUs', revenuePct: 8.4, growthRate: 14.5, details: 'GeForce RTX 40/50 series consumer and desktop gaming' },
      { segment: 'Professional Visualization', revenuePct: 2.5, growthRate: 20.1, details: 'Omniverse, CAD, and Digital Twin enterprise workstation solutions' },
      { segment: 'Automotive & Robotics', revenuePct: 1.9, growthRate: 37.0, details: 'NVIDIA DRIVE Orin/Thor and Isaac humanoid robotics platforms' }
    ],
    swot: {
      strengths: [
        'Massive CUDA software ecosystem lock-in with 5M+ registered developers',
        'Industry-leading 75%+ gross margins supported by premium pricing power',
        'End-to-end full-stack AI networking (Quantum-X InfiniBand & Spectrum-X Ethernet)'
      ],
      weaknesses: [
        'Customer concentration: Top 4 hyperscalers represent ~40% of total revenue',
        'Heavy reliance on TSMC foundry for CoWoS advanced packaging capacity'
      ],
      opportunities: [
        'Sovereign AI infrastructure buildouts across Europe, Asia, and Middle East',
        'Physical AI, Robotics, and Industrial digital twins scaling by 2026-2027',
        'Edge AI and autonomous vehicle compute integration'
      ],
      threats: [
        'In-house ASIC silicon development by AWS (Trainium), Google (TPU), and Meta (MTIA)',
        'Geopolitical export restrictions impacting sales in Chinese and MENA regions'
      ]
    },
    bullCase: [
      'Blackwell B200 production ramp exceeds consensus by 20% in H2 2025',
      'Enterprise software monetization (NVIDIA AI Enterprise) reaches $5B ARR',
      'Operating margins remain sustained above 62%'
    ],
    bearCase: [
      'Hyperscaler Capex digestion period slows order cadence in 2026',
      'TSMC wafer allocation bottlenecks constrain delivery targets',
      'China market revenues drop below 5% of mix due to tighter BIS restrictions'
    ],
    catalysts: [
      { catalyst: 'GTC Developer Keynote & Next-Gen Architecture Roadmap', timeline: 'Q1 2025', impact: 'High' },
      { catalyst: 'Blackwell Volume Shipment Ramp & Hyperscaler Delivery', timeline: 'Q2 2025', impact: 'High' },
      { catalyst: 'NVIDIA AI Enterprise software licensing inflection', timeline: 'H2 2025', impact: 'Medium' }
    ],
    accountingRedFlags: [
      'No critical accounting discrepancies identified; DSO at healthy 42 days.',
      'Minor monitoring recommended on supplier advance commitments for CoWoS packaging.'
    ]
  },
  AAPL: {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Information Technology',
    industry: 'Consumer Electronics & Services',
    currentPrice: 228.40,
    marketCap: '$3.48 Trillion',
    peRatio: 33.6,
    forwardPE: 28.5,
    pegRatio: 2.45,
    evToEbitda: 24.1,
    priceToSales: 8.9,
    priceToBook: 52.0,
    dividendYield: 0.44,
    beta: 1.08,
    executiveSummary: 'Apple commands an unrivaled ecosystem of 2.2B+ active devices with sticky high-margin Services revenue approaching $100B annually. Apple Intelligence rollout catalyzes an iPhone upgrade supercycle, accompanied by robust capital returns through massive share buybacks.',
    financialHealthScore: 92,
    moatRating: 'Wide',
    valuationVerdict: 'Buy',
    targetPrice12M: {
      bull: 275.00,
      base: 245.00,
      bear: 185.00
    },
    dupontAnalysis: {
      netProfitMargin: 25.3,
      assetTurnover: 1.10,
      financialLeverage: 5.60,
      roe: 156.0
    },
    keyRatios: {
      grossMargin: 46.2,
      operatingMargin: 31.4,
      freeCashFlowYield: 3.12,
      currentRatio: 1.02,
      quickRatio: 0.88,
      debtToEquity: 1.45,
      interestCoverage: 28.6,
      fcfConversion: 104.0
    },
    historicalPerformance: [
      { year: '2021', revenue: 365.8, netIncome: 94.68, fcf: 92.95, grossMargin: 41.8, opMargin: 29.8 },
      { year: '2022', revenue: 394.3, netIncome: 99.80, fcf: 111.4, grossMargin: 43.3, opMargin: 30.3 },
      { year: '2023', revenue: 383.3, netIncome: 97.00, fcf: 99.58, grossMargin: 44.1, opMargin: 29.8 },
      { year: '2024', revenue: 391.0, netIncome: 101.5, fcf: 108.0, grossMargin: 46.2, opMargin: 31.5 },
      { year: '2025E', revenue: 422.0, netIncome: 112.0, fcf: 118.5, grossMargin: 47.0, opMargin: 32.5 }
    ],
    segmentBreakdown: [
      { segment: 'iPhone', revenuePct: 51.5, growthRate: 5.5, details: 'Flagship iPhone 16/16 Pro series with on-device Apple Intelligence' },
      { segment: 'Services', revenuePct: 24.8, growthRate: 14.2, details: 'App Store, Apple Music, iCloud, Apple Pay, AppleCare, Subscriptions' },
      { segment: 'Wearables, Home & Accessories', revenuePct: 9.8, growthRate: -1.2, details: 'Apple Watch, AirPods, HomePod, Beats' },
      { segment: 'Mac & iPad', revenuePct: 13.9, growthRate: 6.8, details: 'M4 Silicon powered MacBook Pro, iPad Pro OLED' }
    ],
    swot: {
      strengths: [
        'Global brand equity and consumer switching costs with 98% customer satisfaction',
        'Services revenue mix growing at high double digits with 74% gross margins',
        'Unmatched $100B+ annual share buyback and cash generation program'
      ],
      weaknesses: [
        'Smartphone replacement cycles elongating globally',
        'Underperformance in Greater China due to localized competition from Huawei'
      ],
      opportunities: [
        'Apple Intelligence integration driving multi-year hardware replacement wave',
        'Spatial computing & Vision Pro ecosystem expansion into enterprise',
        'Health tech, non-invasive glucose monitoring, and hearing aid features'
      ],
      threats: [
        'EU Digital Markets Act (DMA) and US DOJ antitrust scrutiny on App Store fees and Google search default revenue share'
      ]
    },
    bullCase: [
      'iPhone 16 and 17 AI supercycle accelerates unit growth to +9% YoY',
      'Services margins expand past 76% on recurring high-margin subscription additions',
      'Gross margin breaks 48% driven by high-tier Pro model mix'
    ],
    bearCase: [
      'Antitrust rulings void the $20B/yr Google default search payment agreement',
      'Chinese domestic brand competition erodes market share in premium tier',
      'Regulatory fragmentation increases compliance overhead in Europe'
    ],
    catalysts: [
      { catalyst: 'Apple Intelligence Global Language Expansion & Siri Revamp', timeline: 'Q1 2025', impact: 'High' },
      { catalyst: 'WWDC Developer Conference & iOS 19 Preview', timeline: 'Q2 2025', impact: 'Medium' },
      { catalyst: 'iPhone 17 Slim & Hardware Refresh Announcement', timeline: 'Q3 2025', impact: 'High' }
    ],
    accountingRedFlags: [
      'Clean balance sheet with excellent working capital management.',
      'No deferred revenue recognition anomalies detected.'
    ]
  },
  MSFT: {
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    sector: 'Information Technology',
    industry: 'Systems Software & Enterprise Cloud',
    currentPrice: 432.10,
    marketCap: '$3.21 Trillion',
    peRatio: 35.2,
    forwardPE: 29.8,
    pegRatio: 2.15,
    evToEbitda: 23.8,
    priceToSales: 13.1,
    priceToBook: 12.4,
    dividendYield: 0.77,
    beta: 0.92,
    executiveSummary: 'Microsoft represents the gold standard in enterprise enterprise SaaS and cloud infrastructure. Azure revenue acceleration, Copilot adoption across 400M+ Office 365 commercial seats, and deep OpenAI partnership provide sustained long-term compounding growth.',
    financialHealthScore: 96,
    moatRating: 'Wide',
    valuationVerdict: 'Buy',
    targetPrice12M: {
      bull: 510.00,
      base: 475.00,
      bear: 380.00
    },
    dupontAnalysis: {
      netProfitMargin: 35.8,
      assetTurnover: 0.52,
      financialLeverage: 2.05,
      roe: 38.2
    },
    keyRatios: {
      grossMargin: 69.8,
      operatingMargin: 44.6,
      freeCashFlowYield: 2.50,
      currentRatio: 1.25,
      quickRatio: 1.18,
      debtToEquity: 0.38,
      interestCoverage: 42.1,
      fcfConversion: 84.0
    },
    historicalPerformance: [
      { year: '2021', revenue: 168.1, netIncome: 61.27, fcf: 56.12, grossMargin: 68.9, opMargin: 41.6 },
      { year: '2022', revenue: 198.3, netIncome: 72.74, fcf: 65.15, grossMargin: 68.4, opMargin: 42.1 },
      { year: '2023', revenue: 211.9, netIncome: 72.36, fcf: 59.48, grossMargin: 68.9, opMargin: 41.8 },
      { year: '2024', revenue: 245.1, netIncome: 88.14, fcf: 74.07, grossMargin: 69.8, opMargin: 44.6 },
      { year: '2025E', revenue: 280.0, netIncome: 102.0, fcf: 88.00, grossMargin: 70.2, opMargin: 45.5 }
    ],
    segmentBreakdown: [
      { segment: 'Intelligent Cloud (Azure)', revenuePct: 43.5, growthRate: 21.0, details: 'Azure Cloud, Windows Server, SQL Server, Enterprise Services' },
      { segment: 'Productivity & Business Processes', revenuePct: 32.0, growthRate: 11.5, details: 'Office 365, Copilot, LinkedIn, Dynamics 365' },
      { segment: 'More Personal Computing', revenuePct: 24.5, growthRate: 8.2, details: 'Windows OEM, Xbox Gaming, Activision Blizzard, Surface devices' }
    ],
    swot: {
      strengths: [
        'Entrenched enterprise relationships with Fortune 500 decision makers',
        'AAA credit rating with pristine fortress balance sheet ($75B+ cash & equivalents)',
        'Strategic partnership and priority compute tier with OpenAI'
      ],
      weaknesses: [
        'Massive ongoing AI Capex outlays pressuring short-term free cash flow margins',
        'Hardware / Surface division experiencing muted consumer growth'
      ],
      opportunities: [
        'M365 Copilot seat penetration expanding from current ~3% to 20%+ by 2027',
        'Activision Blizzard integration unlocking mobile gaming and subscription synergies',
        'Cybersecurity suite (Microsoft Defender/Sentinel) surpassing $25B ARR'
      ],
      threats: [
        'Intense cloud competition from AWS and Google Cloud Platform',
        'Antitrust scrutiny over bundling Teams and AI software features in Europe'
      ]
    },
    bullCase: [
      'Azure AI contribution adds 12+ points of top-line growth consistently',
      'Copilot ARPU expansion accelerates Productivity gross margins',
      'Free cash flow exceeds $90B by FY2026'
    ],
    bearCase: [
      'Datacenter CapEx yields lower than expected ROI over next 18 months',
      'Enterprise budget tightening delays large software consolidation cycles'
    ],
    catalysts: [
      { catalyst: 'Microsoft Build & Enterprise AI Copilot Upgrades', timeline: 'Q2 2025', impact: 'Medium' },
      { catalyst: 'Quarterly Earnings Azure Growth & Capex Guidance', timeline: 'Quarterly', impact: 'High' }
    ],
    accountingRedFlags: [
      'Zero red flags identified. Unqualified audit opinion by Deloitte & Touche LLP.'
    ]
  }
};
