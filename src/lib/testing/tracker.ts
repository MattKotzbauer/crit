/**
 * Test tracking - detect test coverage for project files
 */

import { join, basename, dirname, relative } from "path";
import type {
  TestStatus,
  TestCoverage,
  FunctionCoverage,
  TestInfo,
  TestFileInfo,
} from "./types";

// Patterns for test files
const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /__tests__\/.+\.[tj]sx?$/,
];

// Patterns for source files that should have tests
const SOURCE_FILE_PATTERNS = [
  /\.ts$/,
  /\.tsx$/,
  /\.js$/,
  /\.jsx$/,
];

// Files/dirs to exclude from test tracking
const EXCLUDED_PATTERNS = [
  /node_modules/,
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /__tests__\//,
  /\.d\.ts$/,
  /types\.ts$/,  // Type-only files don't need tests
  /index\.ts$/,  // Re-export files typically don't need tests
];

/**
 * Check if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  return TEST_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Check if a file is a source file that should have tests
 */
export function isSourceFile(filePath: string): boolean {
  const isSource = SOURCE_FILE_PATTERNS.some((pattern) => pattern.test(filePath));
  const isExcluded = EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
  return isSource && !isExcluded;
}

/**
 * Get the expected test file path(s) for a source file
 */
export function getExpectedTestPaths(sourceFile: string): string[] {
  const dir = dirname(sourceFile);
  const base = basename(sourceFile);
  const ext = base.match(/\.[tj]sx?$/)?.[0] || ".ts";
  const name = base.replace(/\.[tj]sx?$/, "");

  return [
    // foo.ts -> foo.test.ts
    join(dir, `${name}.test${ext}`),
    // foo.ts -> foo.spec.ts
    join(dir, `${name}.spec${ext}`),
    // foo.ts -> __tests__/foo.test.ts
    join(dir, "__tests__", `${name}.test${ext}`),
    // foo.ts -> __tests__/foo.ts
    join(dir, "__tests__", base),
  ];
}

/**
 * Find all source files in a project
 */
async function findSourceFiles(projectPath: string): Promise<string[]> {
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
  const files: string[] = [];

  for await (const file of glob.scan({ cwd: projectPath, absolute: false })) {
    const fullPath = join(projectPath, file);
    if (isSourceFile(fullPath) && !file.includes("node_modules")) {
      files.push(file);
    }
  }

  return files;
}

/**
 * Find all test files in a project
 */
async function findTestFiles(projectPath: string): Promise<string[]> {
  const patterns = [
    "**/*.test.ts",
    "**/*.test.tsx",
    "**/*.spec.ts",
    "**/*.spec.tsx",
    "**/__tests__/**/*.ts",
    "**/__tests__/**/*.tsx",
  ];

  const files = new Set<string>();

  for (const pattern of patterns) {
    const glob = new Bun.Glob(pattern);
    for await (const file of glob.scan({ cwd: projectPath, absolute: false })) {
      if (!file.includes("node_modules")) {
        files.add(file);
      }
    }
  }

  return Array.from(files);
}

/**
 * Parse a test file to extract test information
 */
export async function parseTestFile(filePath: string): Promise<TestFileInfo> {
  const file = Bun.file(filePath);
  const tests: TestInfo[] = [];

  if (!(await file.exists())) {
    return { path: filePath, tests };
  }

  const content = await file.text();
  const lines = content.split("\n");

  // Match describe, test, it blocks
  const patterns = [
    { regex: /^\s*describe\s*\(\s*["'`]([^"'`]+)["'`]/, type: "describe" as const },
    { regex: /^\s*test\s*\(\s*["'`]([^"'`]+)["'`]/, type: "test" as const },
    { regex: /^\s*it\s*\(\s*["'`]([^"'`]+)["'`]/, type: "it" as const },
  ];

  lines.forEach((line, index) => {
    for (const { regex, type } of patterns) {
      const match = line.match(regex);
      if (match) {
        tests.push({
          name: match[1],
          line: index + 1,
          type,
        });
        break;
      }
    }
  });

  return { path: filePath, tests };
}

/**
 * Parse a source file to extract exported function names
 */
export async function parseSourceFile(filePath: string): Promise<string[]> {
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return [];
  }

  const content = await file.text();
  const functions: string[] = [];

  // Match exported functions and constants
  const patterns = [
    // export function foo()
    /export\s+(?:async\s+)?function\s+(\w+)/g,
    // export const foo =
    /export\s+const\s+(\w+)\s*=/g,
    // export { foo, bar }
    /export\s*\{\s*([^}]+)\s*\}/g,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      if (pattern.source.includes("{")) {
        // Handle export { foo, bar }
        const exports = match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]);
        functions.push(...exports);
      } else {
        functions.push(match[1]);
      }
    }
  }

  return [...new Set(functions)];
}

/**
 * Find the test file for a source file (if it exists)
 */
export async function findTestFile(
  projectPath: string,
  sourceFile: string
): Promise<string | null> {
  const expectedPaths = getExpectedTestPaths(sourceFile);

  for (const testPath of expectedPaths) {
    const fullPath = join(projectPath, testPath);
    const file = Bun.file(fullPath);
    if (await file.exists()) {
      return testPath;
    }
  }

  return null;
}

/**
 * Check if a specific file has tests
 */
export async function hasTests(
  projectPath: string,
  filePath: string
): Promise<boolean> {
  // Normalize path to be relative
  const relativePath = filePath.startsWith(projectPath)
    ? relative(projectPath, filePath)
    : filePath;

  // If it's a test file, it has tests by definition
  if (isTestFile(relativePath)) {
    return true;
  }

  // If it's excluded, we don't require tests
  if (!isSourceFile(join(projectPath, relativePath))) {
    return true;
  }

  const testFile = await findTestFile(projectPath, relativePath);
  return testFile !== null;
}

/**
 * Get list of untested files
 */
export async function getUntestedFiles(projectPath: string): Promise<string[]> {
  const sourceFiles = await findSourceFiles(projectPath);
  const untested: string[] = [];

  for (const file of sourceFiles) {
    const testFile = await findTestFile(projectPath, file);
    if (testFile === null) {
      untested.push(file);
    }
  }

  return untested;
}

/**
 * Check if exported functions have corresponding tests
 */
async function checkFunctionCoverage(
  projectPath: string,
  sourceFile: string,
  testFile: string | null
): Promise<FunctionCoverage[]> {
  const functions = await parseSourceFile(join(projectPath, sourceFile));

  if (!testFile) {
    return functions.map((name) => ({ name, tested: false }));
  }

  const testInfo = await parseTestFile(join(projectPath, testFile));
  const testNames = testInfo.tests.map((t) => t.name.toLowerCase());

  return functions.map((name) => {
    // Check if function name appears in any test name
    const nameLower = name.toLowerCase();
    const matchingTest = testInfo.tests.find((t) =>
      t.name.toLowerCase().includes(nameLower)
    );

    return {
      name,
      tested: matchingTest !== undefined,
      testLocation: matchingTest
        ? `${testFile}:${matchingTest.line}`
        : undefined,
    };
  });
}

/**
 * Get full test status for a project
 */
export async function getTestStatus(projectPath: string): Promise<TestStatus> {
  const sourceFiles = await findSourceFiles(projectPath);
  const coverage: TestCoverage[] = [];
  const untestedFiles: string[] = [];
  let testedFiles = 0;

  for (const file of sourceFiles) {
    const testFile = await findTestFile(projectPath, file);
    const hasTest = testFile !== null;
    const functions = await checkFunctionCoverage(projectPath, file, testFile);

    coverage.push({
      file,
      hasTests: hasTest,
      testFile: testFile ?? undefined,
      functions,
    });

    if (hasTest) {
      testedFiles++;
    } else {
      untestedFiles.push(file);
    }
  }

  return {
    totalFiles: sourceFiles.length,
    testedFiles,
    untestedFiles,
    coverage,
  };
}
