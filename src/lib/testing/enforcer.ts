/**
 * Test enforcer - ensure tests exist and pass before completion
 */

import { join, relative } from "path";
import { spawn } from "bun";
import type {
  TestRequirement,
  CanMarkDoneResult,
  TestResult,
} from "./types";
import { hasTests, isSourceFile, findTestFile } from "./tracker";

/**
 * Determine priority based on file characteristics
 */
function determinePriority(filePath: string): "low" | "medium" | "high" {
  // Core lib files are high priority
  if (filePath.includes("/lib/")) {
    return "high";
  }

  // Command handlers are medium priority
  if (filePath.includes("/commands/") || filePath.includes("/handlers")) {
    return "medium";
  }

  // Other files are low priority
  return "low";
}

/**
 * Generate reason why file needs tests
 */
function generateReason(filePath: string): string {
  if (filePath.includes("/lib/")) {
    return "Core library file - tests ensure stability";
  }

  if (filePath.includes("/commands/")) {
    return "CLI command - tests verify user-facing behavior";
  }

  if (filePath.includes("/mcp/") || filePath.includes("/handlers")) {
    return "Handler file - tests ensure API contract";
  }

  return "Source file should have corresponding tests";
}

/**
 * Get testing requirements for specific files
 */
export async function getTestRequirements(
  projectPath: string,
  files: string[]
): Promise<TestRequirement[]> {
  const requirements: TestRequirement[] = [];

  for (const file of files) {
    // Normalize path to be relative
    const relativePath = file.startsWith(projectPath)
      ? relative(projectPath, file)
      : file;

    const fullPath = join(projectPath, relativePath);

    // Skip if not a source file that needs tests
    if (!isSourceFile(fullPath)) {
      continue;
    }

    // Check if tests exist
    const tested = await hasTests(projectPath, relativePath);

    if (!tested) {
      requirements.push({
        file: relativePath,
        reason: generateReason(relativePath),
        priority: determinePriority(relativePath),
      });
    }
  }

  return requirements;
}

/**
 * Check if a set of files can be marked as "done"
 * Returns blockers if tests are missing
 */
export async function canMarkDone(
  projectPath: string,
  files: string[]
): Promise<CanMarkDoneResult> {
  const blockers = await getTestRequirements(projectPath, files);

  // Filter to only high/medium priority blockers
  const significantBlockers = blockers.filter(
    (b) => b.priority === "high" || b.priority === "medium"
  );

  return {
    canMark: significantBlockers.length === 0,
    blockers,
  };
}

/**
 * Run tests and verify they pass
 */
export async function verifyTests(
  projectPath: string
): Promise<TestResult> {
  try {
    const proc = spawn({
      cmd: ["bun", "test"],
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + (stderr ? "\n" + stderr : "");
    const passed = exitCode === 0;

    // Extract failed test names if any
    const failedTests: string[] = [];
    if (!passed) {
      // Match lines like "FAIL foo.test.ts > describe > test name"
      const failRegex = /FAIL\s+.+?\s+>\s+(.+)/g;
      let match;
      while ((match = failRegex.exec(output)) !== null) {
        failedTests.push(match[1]);
      }
    }

    return {
      passed,
      output,
      failedTests: failedTests.length > 0 ? failedTests : undefined,
    };
  } catch (error) {
    return {
      passed: false,
      output: `Failed to run tests: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Run tests for specific files only
 */
export async function verifyTestsForFiles(
  projectPath: string,
  files: string[]
): Promise<TestResult> {
  // Find test files for the given source files
  const testFiles: string[] = [];

  for (const file of files) {
    const relativePath = file.startsWith(projectPath)
      ? relative(projectPath, file)
      : file;

    // If it's already a test file, add it directly
    if (relativePath.includes(".test.") || relativePath.includes(".spec.")) {
      testFiles.push(relativePath);
      continue;
    }

    // Find the test file for this source
    const testFile = await findTestFile(projectPath, relativePath);
    if (testFile) {
      testFiles.push(testFile);
    }
  }

  if (testFiles.length === 0) {
    return {
      passed: true,
      output: "No test files found for the given files",
    };
  }

  try {
    // Run bun test with specific test files
    const proc = spawn({
      cmd: ["bun", "test", ...testFiles],
      cwd: projectPath,
      stdout: "pipe",
      stderr: "pipe",
    });

    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    const output = stdout + (stderr ? "\n" + stderr : "");
    const passed = exitCode === 0;

    return {
      passed,
      output,
    };
  } catch (error) {
    return {
      passed: false,
      output: `Failed to run tests: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Full enforcement check - tests exist AND pass
 */
export async function enforceTests(
  projectPath: string,
  files: string[]
): Promise<{
  canProceed: boolean;
  missingTests: TestRequirement[];
  testResult?: TestResult;
}> {
  // First check if tests exist
  const { canMark, blockers } = await canMarkDone(projectPath, files);

  if (!canMark) {
    return {
      canProceed: false,
      missingTests: blockers,
    };
  }

  // Then verify tests pass
  const testResult = await verifyTestsForFiles(projectPath, files);

  return {
    canProceed: testResult.passed,
    missingTests: [],
    testResult,
  };
}
