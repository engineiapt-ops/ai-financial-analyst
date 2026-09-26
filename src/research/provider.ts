import type { AnalyzeOutput } from "../api/analyze.js";
import type { AnalystReport, ResearchEvidence } from "./report.js";

export interface AnalystReportContext {
  analysis: AnalyzeOutput;
  research: {
    sentiment: number;
    evidence: ResearchEvidence[];
  };
}

export interface AnalystReportProvider {
  generateReport(context: AnalystReportContext): Promise<AnalystReport>;
}
