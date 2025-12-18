/**
 * Test command - Show test status and run verification
 */

import { getCritDir, critExists } from "../lib/paths";
import {
  getTestStatus,
  getUntestedFiles,
  verifyTests,
} from "../lib/testing";

interface TestOptions {
  verify?: boolean;
}

export async function test(options: TestOptions) {
  const projectPath = process.cwd();

  // Check if crit is initialized (optional for test command)
  const critDir = getCritDir();
  const hasCrit = critExists();

  console.log("Test Status");
  console.log("===========\n");

  // Get test status
  const status = await getTestStatus(projectPath);

  // Display summary
  const coverage = status.testedFiles / status.totalFiles * 100;
  console.log(`Files with tests: ${status.testedFiles}/${status.totalFiles} (${coverage.toFixed(1)}%)\n`);

  // Display untested files
  if (status.untestedFiles.length > 0) {
    console.log("Untested files:");
    for (const file of status.untestedFiles) {
      console.log(`  - ${file}`);
    }
    console.log();
  } else {
    console.log("All source files have corresponding tests!\n");
  }

  // Display detailed coverage
  if (status.coverage.length > 0) {
    console.log("Coverage Details:");
    console.log("-----------------");
    for (const cov of status.coverage) {
      const icon = cov.hasTests ? "+" : "-";
      const testInfo = cov.testFile ? ` (${cov.testFile})` : "";
      console.log(`[${icon}] ${cov.file}${testInfo}`);

      // Show function coverage if available
      if (cov.functions.length > 0) {
        const testedFns = cov.functions.filter((f) => f.tested).length;
        const totalFns = cov.functions.length;
        if (totalFns > 0) {
          console.log(`    Functions: ${testedFns}/${totalFns} tested`);
        }
      }
    }
    console.log();
  }

  // Run tests if --verify flag is set
  if (options.verify) {
    console.log("Running tests...\n");
    const result = await verifyTests(projectPath);

    if (result.passed) {
      console.log("All tests passed!");
    } else {
      console.log("Tests failed!");
      if (result.failedTests && result.failedTests.length > 0) {
        console.log("\nFailed tests:");
        for (const test of result.failedTests) {
          console.log(`  - ${test}`);
        }
      }
      console.log("\nOutput:");
      console.log(result.output);
      process.exit(1);
    }
  }
}
