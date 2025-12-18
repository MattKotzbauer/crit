/**
 * Types for the bloat/over-engineering detector
 */

export type BloatType =
  | "unused_export"
  | "dead_code"
  | "over_abstraction"
  | "unnecessary_wrapper"
  | "duplicate_logic"
  | "excessive_comments"
  | "tiny_file"
  | "massive_file"
  | "config_bloat";

export type Severity = "low" | "medium" | "high";

export interface BloatIssue {
  type: BloatType;
  file: string;
  line?: number;
  description: string;
  suggestion: string;
  severity: Severity;
}

export interface AnalysisResult {
  issues: BloatIssue[];
  /** 0-100, lower is better (less bloat) */
  score: number;
  summary: string;
}

export interface ProposedCodeCheck {
  isOverEngineered: boolean;
  issues: string[];
  simplerAlternative?: string;
}
