/**
 * Project and file analysis for bloat detection
 */

import { join } from "path";
import type { BloatIssue, AnalysisResult, ProposedCodeCheck } from "./types";
import {
  detectUnusedExports,
  detectOverAbstraction,
  detectDuplicates,
  detectExcessiveComments,
  detectTinyFiles,
  detectMassiveFiles,
  detectConfigBloat,
} from "./detector";

/**
 * Calculate bloat score from issues
 * 0 = no bloat, 100 = severe bloat
 */
function calculateScore(issues: BloatIssue[]): number {
  if (issues.length === 0) return 0;

  const severityWeights = {
    low: 1,
    medium: 3,
    high: 5,
  };

  const totalWeight = issues.reduce(
    (sum, issue) => sum + severityWeights[issue.severity],
    0
  );

  // Cap at 100
  return Math.min(100, Math.round(totalWeight * 2));
}

/**
 * Generate summary from issues
 */
function generateSummary(issues: BloatIssue[]): string {
  if (issues.length === 0) {
    return "No bloat detected. Codebase looks clean!";
  }

  const counts = {
    unused_export: 0,
    dead_code: 0,
    over_abstraction: 0,
    unnecessary_wrapper: 0,
    duplicate_logic: 0,
    excessive_comments: 0,
    tiny_file: 0,
    massive_file: 0,
    config_bloat: 0,
  };

  for (const issue of issues) {
    counts[issue.type]++;
  }

  const parts: string[] = [];

  if (counts.unused_export > 0) {
    parts.push(`${counts.unused_export} unused export(s)`);
  }
  if (counts.over_abstraction > 0) {
    parts.push(`${counts.over_abstraction} over-abstracted file(s)`);
  }
  if (counts.unnecessary_wrapper > 0) {
    parts.push(`${counts.unnecessary_wrapper} unnecessary wrapper(s)`);
  }
  if (counts.duplicate_logic > 0) {
    parts.push(`${counts.duplicate_logic} duplicate code block(s)`);
  }
  if (counts.excessive_comments > 0) {
    parts.push(`${counts.excessive_comments} file(s) with excessive comments`);
  }
  if (counts.tiny_file > 0) {
    parts.push(`${counts.tiny_file} tiny file(s)`);
  }
  if (counts.massive_file > 0) {
    parts.push(`${counts.massive_file} massive file(s)`);
  }
  if (counts.config_bloat > 0) {
    parts.push(`${counts.config_bloat} bloated config(s)`);
  }

  const highSeverity = issues.filter((i) => i.severity === "high").length;
  const severity =
    highSeverity > 3
      ? "Significant bloat detected"
      : highSeverity > 0
        ? "Some bloat issues found"
        : "Minor bloat issues found";

  return `${severity}: ${parts.join(", ")}.`;
}

/**
 * Full project analysis - runs all detectors
 */
export async function analyzeProject(
  projectPath: string
): Promise<AnalysisResult> {
  // Run all detectors in parallel
  const [
    unusedExports,
    overAbstraction,
    duplicates,
    tinyFiles,
    massiveFiles,
    configBloat,
  ] = await Promise.all([
    detectUnusedExports(projectPath),
    detectOverAbstraction(projectPath),
    detectDuplicates(projectPath),
    detectTinyFiles(projectPath),
    detectMassiveFiles(projectPath),
    detectConfigBloat(projectPath),
  ]);

  const issues = [
    ...unusedExports,
    ...overAbstraction,
    ...duplicates,
    ...tinyFiles,
    ...massiveFiles,
    ...configBloat,
  ];

  return {
    issues,
    score: calculateScore(issues),
    summary: generateSummary(issues),
  };
}

/**
 * Single file analysis
 */
export async function analyzeFile(filePath: string): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return issues;
  }

  const content = await file.text();
  const lines = content.split("\n");
  const lineCount = lines.length;
  const nonEmptyLines = lines.filter((l) => l.trim()).length;

  // Check file size
  if (lineCount > 500) {
    issues.push({
      type: "massive_file",
      file: filePath,
      description: `File has ${lineCount} lines`,
      suggestion: "Consider splitting this file into smaller, focused modules",
      severity: lineCount > 1000 ? "high" : "medium",
    });
  } else if (nonEmptyLines < 10 && !filePath.endsWith("index.ts")) {
    issues.push({
      type: "tiny_file",
      file: filePath,
      description: `File has only ${nonEmptyLines} non-empty lines`,
      suggestion:
        "Consider inlining this code into a related file or combining with similar modules",
      severity: "low",
    });
  }

  // Check comments
  const commentIssues = await detectExcessiveComments(filePath);
  issues.push(...commentIssues);

  // Check for wrapper functions
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Detect wrapper functions
    const wrapperMatch = line.match(
      /(?:const|let|function)\s+(\w+)\s*=?\s*\([^)]*\)\s*(?:=>|{)\s*(?:return\s+)?(\w+)\s*\([^)]*\)\s*;?\s*}?\s*$/
    );
    if (wrapperMatch) {
      const [, wrapperName, calledFn] = wrapperMatch;
      if (wrapperName !== calledFn) {
        issues.push({
          type: "unnecessary_wrapper",
          file: filePath,
          line: i + 1,
          description: `Function '${wrapperName}' is a simple wrapper around '${calledFn}'`,
          suggestion: `Consider using '${calledFn}' directly`,
          severity: "low",
        });
      }
    }
  }

  // Check abstraction level
  const extendsCount = (content.match(/\bextends\b/g) || []).length;
  const implementsCount = (content.match(/\bimplements\b/g) || []).length;
  const abstractCount = (content.match(/\babstract\s+class\b/g) || []).length;
  const factoryCount = (
    content.match(/(?:Factory|Builder|Provider|Service)\b/g) || []
  ).length;
  const genericCount = (content.match(/<[A-Z]\w*(?:\s+extends\s+\w+)?>/g) || [])
    .length;

  const abstractionScore =
    extendsCount * 2 +
    implementsCount +
    abstractCount * 3 +
    factoryCount * 2 +
    Math.max(0, genericCount - 3);

  if (abstractionScore > 10) {
    issues.push({
      type: "over_abstraction",
      file: filePath,
      description: `File has high abstraction complexity (score: ${abstractionScore})`,
      suggestion:
        "Consider simplifying - prefer composition over deep inheritance",
      severity: abstractionScore > 20 ? "high" : "medium",
    });
  }

  return issues;
}

/**
 * Check if proposed code is over-engineered
 */
export async function checkProposedCode(
  code: string,
  context: string
): Promise<ProposedCodeCheck> {
  const issues: string[] = [];

  // Check for common over-engineering patterns
  const lines = code.split("\n");
  const lineCount = lines.length;

  // Too much code for simple task
  const contextLower = context.toLowerCase();
  const isSimpleTask =
    contextLower.includes("simple") ||
    contextLower.includes("basic") ||
    contextLower.includes("quick") ||
    contextLower.includes("just");

  if (isSimpleTask && lineCount > 50) {
    issues.push(
      `${lineCount} lines seems excessive for what's described as a simple task`
    );
  }

  // Check for excessive abstraction patterns
  const classCount = (code.match(/\bclass\b/g) || []).length;
  const interfaceCount = (code.match(/\binterface\b/g) || []).length;
  const typeCount = (code.match(/\btype\s+\w+\s*=/g) || []).length;
  const factoryCount = (code.match(/Factory|Builder|Strategy|Observer/g) || [])
    .length;

  if (factoryCount > 0 && lineCount < 100) {
    issues.push(
      "Design patterns like Factory/Builder/Strategy may be overkill for this size of code"
    );
  }

  if (classCount > 3) {
    issues.push(
      `${classCount} classes may be over-engineered - consider simpler functions`
    );
  }

  if (interfaceCount + typeCount > 5) {
    issues.push(
      `${interfaceCount + typeCount} type definitions seems excessive - consider simpler typing`
    );
  }

  // Check for deep nesting
  let maxIndent = 0;
  for (const line of lines) {
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    maxIndent = Math.max(maxIndent, indent);
  }
  if (maxIndent > 16) {
    // ~4 levels of nesting with 4-space indent
    issues.push("Deep nesting detected - consider extracting functions");
  }

  // Check for unnecessary async/await
  const asyncCount = (code.match(/\basync\b/g) || []).length;
  const awaitCount = (code.match(/\bawait\b/g) || []).length;
  if (asyncCount > awaitCount + 2) {
    issues.push("Some async functions may not need to be async");
  }

  // Generate simpler alternative suggestion if issues found
  let simplerAlternative: string | undefined;
  if (issues.length > 0) {
    const suggestions: string[] = [];

    if (classCount > 1) {
      suggestions.push("Use plain functions instead of classes");
    }
    if (interfaceCount > 2) {
      suggestions.push("Use inline types or type inference");
    }
    if (factoryCount > 0) {
      suggestions.push("Use simple constructor or factory function");
    }
    if (maxIndent > 16) {
      suggestions.push("Extract nested logic into separate functions");
    }

    if (suggestions.length > 0) {
      simplerAlternative = `Consider: ${suggestions.join("; ")}`;
    }
  }

  return {
    isOverEngineered: issues.length > 0,
    issues,
    simplerAlternative,
  };
}
