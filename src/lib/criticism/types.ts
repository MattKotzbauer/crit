/**
 * Criticism types for crit's critical analysis system
 *
 * Three categories:
 * - ELIM: Dead code, unused abstractions, unnecessary complexity
 * - SIMPLIFY: Better patterns, simpler implementations
 * - TEST: Missing test coverage, fragile areas
 */

export type CriticismCategory = "ELIM" | "SIMPLIFY" | "TEST";

export type CriticismSeverity = "low" | "medium" | "high";

export type CriticismStatus = "pending" | "accepted" | "rejected" | "skipped";

export interface Criticism {
  id: string;
  category: CriticismCategory;
  subject: string;           // Short label (e.g., "unused helper", "complex parser")
  description: string;       // Full explanation
  files: string[];           // Affected files
  location?: string;         // Specific location (e.g., "src/lib/utils.ts:42")
  severity: CriticismSeverity;
  status: CriticismStatus;
  diff?: string;             // Proposed change (unified diff format)
  createdAt: string;         // ISO timestamp
  reasoning?: string;        // User's reasoning when accepting/rejecting
}

export interface CriticismStore {
  criticisms: Criticism[];
  lastAnalysis: string;      // ISO timestamp of last analysis run
}

// Icons for TUI display
export const CATEGORY_ICONS: Record<CriticismCategory, string> = {
  ELIM: "✗",
  SIMPLIFY: "↓",
  TEST: "◆",
};

// Colors for TUI display (ANSI codes)
export const CATEGORY_COLORS: Record<CriticismCategory, string> = {
  ELIM: "\x1b[31m",      // Red
  SIMPLIFY: "\x1b[33m",  // Yellow
  TEST: "\x1b[36m",      // Cyan
};

// For MCP/Claude Code to generate criticisms
export interface CriticismRequest {
  files?: string[];          // Specific files to analyze (or all if empty)
  categories?: CriticismCategory[];  // Filter to specific categories
  includeContext?: boolean;  // Include project context in analysis
}

export interface CriticismResponse {
  criticisms: Criticism[];
  analysisTime: number;      // ms taken
}
