// Types
export type { ContextFile, ProjectAnalysis, InjectionResult } from './types';

// Manager - CRUD operations for context docs
export {
  loadContext,
  getContextFile,
  saveContextFile,
  listContextFiles,
  deleteContextFile,
  formatForLLM,
  ensureContextDir,
} from './manager';

// Analyzer - Project analysis
export {
  analyzeProject,
  generateArchitectureDoc,
  generateImplementationDoc,
  getProjectSummary,
} from './analyzer';

// Injector - CLAUDE.md injection
export {
  injectIntoClaudeMd,
  removeFromClaudeMd,
  updateClaudeMdSection,
  hasCritSection,
  getCritSection,
} from './injector';
