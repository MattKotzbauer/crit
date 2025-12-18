/**
 * Types for test tracking and enforcement
 */

export interface FunctionCoverage {
  name: string;
  tested: boolean;
  testLocation?: string;  // e.g., "foo.test.ts:42"
}

export interface TestCoverage {
  file: string;
  hasTests: boolean;
  testFile?: string;
  functions: FunctionCoverage[];
}

export interface TestStatus {
  totalFiles: number;
  testedFiles: number;
  untestedFiles: string[];
  coverage: TestCoverage[];
}

export interface TestRequirement {
  file: string;
  reason: string;  // Why this needs tests
  priority: "low" | "medium" | "high";
}

export interface TestResult {
  passed: boolean;
  output: string;
  failedTests?: string[];
}

export interface CanMarkDoneResult {
  canMark: boolean;
  blockers: TestRequirement[];
}

export interface TestInfo {
  name: string;
  line: number;
  type: "describe" | "test" | "it";
}

export interface TestFileInfo {
  path: string;
  tests: TestInfo[];
}
