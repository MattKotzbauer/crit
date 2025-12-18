/**
 * Bloat/Over-engineering Detector
 *
 * Detects unnecessary code, over-engineering patterns,
 * and suggests simplifications.
 */

// Types
export type {
  BloatType,
  Severity,
  BloatIssue,
  AnalysisResult,
  ProposedCodeCheck,
} from "./types";

// Detectors
export {
  detectUnusedExports,
  detectOverAbstraction,
  detectDuplicates,
  detectExcessiveComments,
  detectTinyFiles,
  detectMassiveFiles,
  detectConfigBloat,
} from "./detector";

// Analyzers
export { analyzeProject, analyzeFile, checkProposedCode } from "./analyzer";
