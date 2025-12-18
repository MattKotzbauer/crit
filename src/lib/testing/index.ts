/**
 * Test tracking and enforcement for crit
 */

// Types
export type {
  TestCoverage,
  TestStatus,
  TestRequirement,
  TestResult,
  CanMarkDoneResult,
  FunctionCoverage,
  TestInfo,
  TestFileInfo,
} from "./types";

// Tracker functions
export {
  getTestStatus,
  hasTests,
  findTestFile,
  getUntestedFiles,
  isTestFile,
  isSourceFile,
  getExpectedTestPaths,
  parseTestFile,
  parseSourceFile,
} from "./tracker";

// Enforcer functions
export {
  canMarkDone,
  getTestRequirements,
  verifyTests,
  verifyTestsForFiles,
  enforceTests,
} from "./enforcer";
