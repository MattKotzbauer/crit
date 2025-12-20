/**
 * Analysis Module - targeted LLM code issue detection
 *
 * Combines multiple analyzers to find real problems:
 * - Code clones (LLMs copy-paste without consolidating)
 * - Hardcoded secrets (commonly reintroduced by AI)
 * - Rule violations (AI ignores project conventions)
 * - Unused imports (AI imports everything "just in case")
 */

import { join, relative, extname } from "path";
import { existsSync, readdirSync } from "fs";
import type { Criticism } from "../criticism/types";
import { detectCodeClones, checkFileForClones } from "./clones";
import { scanFileForSecrets, secretsToCriticisms } from "./secrets";
import { checkFileAgainstRules } from "./rules";
import { findUnusedImports } from "./imports";

export { detectCodeClones, checkFileForClones } from "./clones";
export { scanFileForSecrets, secretsToCriticisms } from "./secrets";
export { checkFileAgainstRules, loadProjectRules } from "./rules";
export { findUnusedImports } from "./imports";

export interface AnalysisResult {
  criticisms: Criticism[];
  stats: {
    filesAnalyzed: number;
    clonesFound: number;
    secretsFound: number;
    ruleViolations: number;
    unusedImports: number;
  };
}

/**
 * Find all source files in a directory
 */
function findSourceFiles(dir: string, projectRoot: string): string[] {
  const files: string[] = [];
  const skipDirs = ["node_modules", ".git", "dist", "build", ".crit", ".orchestra", "coverage"];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          files.push(...findSourceFiles(fullPath, projectRoot));
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
          // Skip test files
          if (!entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
            files.push(fullPath);
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return files;
}

/**
 * Analyze a single file for issues
 */
export async function analyzeFile(
  filePath: string,
  projectPath: string
): Promise<Criticism[]> {
  const criticisms: Criticism[] = [];
  const relativePath = relative(projectPath, filePath);

  // Check for secrets
  const secrets = scanFileForSecrets(filePath);
  if (secrets.length > 0) {
    criticisms.push(...secretsToCriticisms(relativePath, secrets));
  }

  // Check against project rules
  const ruleViolations = checkFileAgainstRules(filePath, projectPath);
  criticisms.push(...ruleViolations);

  // Check for unused imports
  const unusedImports = findUnusedImports(filePath);
  criticisms.push(...unusedImports);

  return criticisms;
}

/**
 * Full project analysis
 */
export async function analyzeProject(projectPath: string): Promise<AnalysisResult> {
  const criticisms: Criticism[] = [];
  const stats = {
    filesAnalyzed: 0,
    clonesFound: 0,
    secretsFound: 0,
    ruleViolations: 0,
    unusedImports: 0,
  };

  // Find all source files
  const sourceFiles = findSourceFiles(projectPath, projectPath);
  stats.filesAnalyzed = sourceFiles.length;

  // Analyze each file
  for (const file of sourceFiles) {
    const fileCriticisms = await analyzeFile(file, projectPath);

    for (const c of fileCriticisms) {
      if (c.description.includes("secret") || c.description.includes("credential")) {
        stats.secretsFound++;
      } else if (c.description.includes("Rule from") || c.description.includes("instead of")) {
        stats.ruleViolations++;
      } else if (c.description.includes("unused import")) {
        stats.unusedImports++;
      }
    }

    criticisms.push(...fileCriticisms);
  }

  // Run clone detection (project-wide)
  try {
    const cloneResult = await detectCodeClones(projectPath);
    stats.clonesFound = cloneResult.totalClones;
    criticisms.push(...cloneResult.criticisms);
  } catch {
    // Clone detection can fail, continue without it
  }

  return { criticisms, stats };
}

/**
 * Analyze only changed files (for incremental updates)
 */
export async function analyzeChangedFiles(
  projectPath: string,
  changedFiles: string[]
): Promise<AnalysisResult> {
  const criticisms: Criticism[] = [];
  const stats = {
    filesAnalyzed: changedFiles.length,
    clonesFound: 0,
    secretsFound: 0,
    ruleViolations: 0,
    unusedImports: 0,
  };

  for (const file of changedFiles) {
    const fullPath = file.startsWith("/") ? file : join(projectPath, file);
    if (!existsSync(fullPath)) continue;

    const fileCriticisms = await analyzeFile(fullPath, projectPath);

    for (const c of fileCriticisms) {
      if (c.description.includes("secret") || c.description.includes("credential")) {
        stats.secretsFound++;
      } else if (c.description.includes("Rule from") || c.description.includes("instead of")) {
        stats.ruleViolations++;
      } else if (c.description.includes("unused import")) {
        stats.unusedImports++;
      }
    }

    criticisms.push(...fileCriticisms);
  }

  // For changed files, optionally check for clones involving these files
  // (Skip full clone detection for performance - it runs on full project anyway)

  return { criticisms, stats };
}
