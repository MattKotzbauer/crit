/**
 * Analyzer - generates criticisms from file changes
 *
 * Targets actual LLM-generated code issues:
 * - Code clones (LLMs copy-paste without consolidating)
 * - Hardcoded secrets (commonly reintroduced by AI)
 * - Rule violations (AI ignores project conventions)
 * - Unused imports (AI imports everything "just in case")
 */

import { join, basename, dirname, extname, relative } from "path";
import { existsSync, readdirSync } from "fs";
import type { WatchEvent } from "./watcher";
import {
  addCriticism,
  generateCriticismId,
  loadCriticisms,
} from "../lib/criticism/store";
import { wasRejected } from "../lib/criticism/preferences";
import type { Criticism } from "../lib/criticism/types";
import {
  analyzeProject as runFullAnalysis,
  analyzeChangedFiles,
  detectCodeClones,
} from "../lib/analysis";

export interface AnalysisResult {
  criticisms: Criticism[];
  analyzed: number;
  stats?: {
    clonesFound: number;
    secretsFound: number;
    ruleViolations: number;
    unusedImports: number;
  };
}

/**
 * Recursively find all source files in a directory
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
          if (!entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
            files.push(relative(projectRoot, fullPath));
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
 * Perform initial analysis of entire project (cold start)
 */
export async function analyzeProject(projectPath: string): Promise<AnalysisResult> {
  const result = await runFullAnalysis(projectPath);

  // Filter out rejected criticisms
  const filteredCriticisms = result.criticisms.filter(
    (c) => !wasRejected(projectPath, c.category, c.subject)
  );

  // Add unique criticisms to store
  const store = loadCriticisms(projectPath);
  const existingIds = new Set(store.criticisms.map((c) => c.id));

  for (const criticism of filteredCriticisms) {
    if (!existingIds.has(criticism.id)) {
      addCriticism(projectPath, criticism);
    }
  }

  return {
    criticisms: filteredCriticisms,
    analyzed: result.stats.filesAnalyzed,
    stats: result.stats,
  };
}

/**
 * Analyze changed files and generate criticisms
 */
export async function analyzeChanges(
  projectPath: string,
  events: WatchEvent[]
): Promise<AnalysisResult> {
  // Filter to source files only
  const sourceFiles = events
    .filter((e) => e.type !== "unlink")
    .filter((e) => {
      const ext = extname(e.path);
      return [".ts", ".tsx", ".js", ".jsx"].includes(ext);
    })
    .filter((e) => !e.path.includes(".test.") && !e.path.includes(".spec."))
    .map((e) => e.path);

  if (sourceFiles.length === 0) {
    return { criticisms: [], analyzed: 0 };
  }

  // Run targeted analysis on changed files
  const result = await analyzeChangedFiles(projectPath, sourceFiles);

  // Check for missing tests on new files
  const newFiles = events.filter((e) => e.type === "add");
  for (const event of newFiles) {
    const filePath = event.path.startsWith("/")
      ? event.path
      : join(projectPath, event.path);

    if (!existsSync(filePath)) continue;

    const testPath = findTestPath(filePath);
    if (!testPath) {
      const subject = `missing tests for ${basename(event.path)}`;

      if (!wasRejected(projectPath, "TEST", subject)) {
        result.criticisms.push({
          id: generateCriticismId("TEST", subject, [event.path]),
          category: "TEST",
          subject,
          description: `New file ${basename(event.path)} was added without corresponding tests. Consider adding test coverage for this module.`,
          files: [event.path],
          location: event.path,
          severity: "medium",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // Filter out rejected criticisms
  const filteredCriticisms = result.criticisms.filter(
    (c) => !wasRejected(projectPath, c.category, c.subject)
  );

  // Add unique criticisms to store
  const store = loadCriticisms(projectPath);
  const existingIds = new Set(store.criticisms.map((c) => c.id));

  for (const criticism of filteredCriticisms) {
    if (!existingIds.has(criticism.id)) {
      addCriticism(projectPath, criticism);
    }
  }

  return {
    criticisms: filteredCriticisms,
    analyzed: sourceFiles.length,
    stats: result.stats,
  };
}

/**
 * Run clone detection separately (expensive, run less frequently)
 */
export async function runCloneDetection(projectPath: string): Promise<AnalysisResult> {
  const cloneResult = await detectCodeClones(projectPath);

  const filteredCriticisms = cloneResult.criticisms.filter(
    (c) => !wasRejected(projectPath, c.category, c.subject)
  );

  const store = loadCriticisms(projectPath);
  const existingIds = new Set(store.criticisms.map((c) => c.id));

  for (const criticism of filteredCriticisms) {
    if (!existingIds.has(criticism.id)) {
      addCriticism(projectPath, criticism);
    }
  }

  return {
    criticisms: filteredCriticisms,
    analyzed: 0,
    stats: {
      clonesFound: cloneResult.totalClones,
      secretsFound: 0,
      ruleViolations: 0,
      unusedImports: 0,
    },
  };
}

function findTestPath(filePath: string): string | null {
  const dir = dirname(filePath);
  const base = basename(filePath);
  const ext = extname(filePath);
  const name = base.slice(0, -ext.length);

  const patterns = [
    join(dir, `${name}.test${ext}`),
    join(dir, `${name}.spec${ext}`),
    join(dir, "__tests__", `${name}${ext}`),
    join(dir, "__tests__", `${name}.test${ext}`),
  ];

  for (const pattern of patterns) {
    if (existsSync(pattern)) {
      return pattern;
    }
  }

  return null;
}
