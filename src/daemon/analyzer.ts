/**
 * Analyzer - generates criticisms from file changes
 *
 * When files change, analyzes them for:
 * - ELIM: Dead code, unused exports, unnecessary abstractions
 * - SIMPLIFY: Complex patterns that could be simpler
 * - TEST: Missing test coverage
 */

import { join, basename, dirname, extname } from "path";
import { existsSync, readFileSync } from "fs";
import type { WatchEvent } from "./watcher";
import {
  addCriticism,
  generateCriticismId,
  loadCriticisms,
} from "../lib/criticism/store";
import { wasRejected } from "../lib/criticism/preferences";
import type { Criticism, CriticismCategory } from "../lib/criticism/types";
import { analyzeFile as analyzeBloat } from "../lib/bloat";

interface AnalysisResult {
  criticisms: Criticism[];
  analyzed: number;
}

/**
 * Analyze changed files and generate criticisms
 */
export async function analyzeChanges(
  projectPath: string,
  events: WatchEvent[]
): Promise<AnalysisResult> {
  const criticisms: Criticism[] = [];
  let analyzed = 0;

  // Filter to source files only
  const sourceFiles = events
    .filter(e => e.type !== "unlink")
    .filter(e => {
      const ext = extname(e.path);
      return [".ts", ".tsx", ".js", ".jsx"].includes(ext);
    })
    .filter(e => !e.path.includes(".test.") && !e.path.includes(".spec."));

  for (const event of sourceFiles) {
    analyzed++;
    const filePath = event.path.startsWith("/")
      ? event.path
      : join(projectPath, event.path);

    if (!existsSync(filePath)) continue;

    // Check for bloat issues
    try {
      const bloatIssues = await analyzeBloat(filePath);

      for (const issue of bloatIssues) {
        const category = mapBloatToCategory(issue.type);
        const subject = issue.description.split(".")[0]; // First sentence as subject

        // Skip if user previously rejected this
        if (wasRejected(projectPath, category, subject)) {
          continue;
        }

        const criticism: Criticism = {
          id: generateCriticismId(category, subject, [event.path]),
          category,
          subject,
          description: issue.description + (issue.suggestion ? `\n\nSuggestion: ${issue.suggestion}` : ""),
          files: [event.path],
          location: issue.line ? `${event.path}:${issue.line}` : event.path,
          severity: issue.severity,
          status: "pending",
          createdAt: new Date().toISOString(),
        };

        criticisms.push(criticism);
      }
    } catch {
      // Ignore analysis errors
    }

    // Check for missing tests
    if (event.type === "add") {
      const testPath = findTestPath(filePath);
      if (!testPath) {
        const subject = `missing tests for ${basename(event.path)}`;

        if (!wasRejected(projectPath, "TEST", subject)) {
          criticisms.push({
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

    // Check for potential simplifications in the code
    const simplifications = await findSimplifications(filePath, event.path);
    for (const simp of simplifications) {
      if (!wasRejected(projectPath, "SIMPLIFY", simp.subject)) {
        criticisms.push(simp);
      }
    }
  }

  // Add unique criticisms to store (avoid duplicates)
  const store = loadCriticisms(projectPath);
  const existingIds = new Set(store.criticisms.map(c => c.id));

  for (const criticism of criticisms) {
    if (!existingIds.has(criticism.id)) {
      addCriticism(projectPath, criticism);
    }
  }

  return {
    criticisms,
    analyzed,
  };
}

function mapBloatToCategory(bloatType: string): CriticismCategory {
  switch (bloatType) {
    case "unused_export":
    case "dead_code":
    case "tiny_file":
      return "ELIM";
    case "over_abstraction":
    case "unnecessary_wrapper":
    case "duplicate_logic":
    case "excessive_comments":
    case "massive_file":
    case "config_bloat":
      return "SIMPLIFY";
    default:
      return "SIMPLIFY";
  }
}

function findTestPath(filePath: string): string | null {
  const dir = dirname(filePath);
  const base = basename(filePath);
  const ext = extname(filePath);
  const name = base.slice(0, -ext.length);

  // Common test file patterns
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

async function findSimplifications(filePath: string, relativePath: string): Promise<Criticism[]> {
  const criticisms: Criticism[] = [];

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");

    // Check for deeply nested callbacks/promises
    let maxIndent = 0;
    let deepNestLine = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const indent = line.length - line.trimStart().length;
      if (indent > maxIndent && line.trim().length > 0) {
        maxIndent = indent;
        deepNestLine = i + 1;
      }
    }

    if (maxIndent > 24) { // More than 6 levels of 4-space indentation
      const subject = "deeply nested code";
      criticisms.push({
        id: generateCriticismId("SIMPLIFY", subject, [relativePath]),
        category: "SIMPLIFY",
        subject,
        description: `This file has deeply nested code (${Math.floor(maxIndent / 4)} levels at line ${deepNestLine}). Consider using early returns, extracting functions, or using async/await to flatten the structure.`,
        files: [relativePath],
        location: `${relativePath}:${deepNestLine}`,
        severity: "medium",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    // Check for long functions (heuristic: lots of lines between function start and end)
    const functionRegex = /^(\s*)(async\s+)?function\s+\w+|^(\s*)(async\s+)?\w+\s*[=:]\s*(async\s+)?\([^)]*\)\s*=>/gm;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const startLine = content.slice(0, match.index).split("\n").length;
      // Simple heuristic: count lines until we see a closing brace at same indent
      const indent = match[1]?.length || match[3]?.length || 0;
      let braceCount = 0;
      let lineCount = 0;
      let foundStart = false;

      for (let i = startLine - 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("{")) {
          braceCount++;
          foundStart = true;
        }
        if (line.includes("}")) {
          braceCount--;
          if (foundStart && braceCount === 0) {
            lineCount = i - startLine + 1;
            break;
          }
        }
      }

      if (lineCount > 50) {
        const subject = "long function";
        const funcName = match[0].match(/function\s+(\w+)|(\w+)\s*[=:]/)?.[1] || "anonymous";
        criticisms.push({
          id: generateCriticismId("SIMPLIFY", subject, [relativePath]),
          category: "SIMPLIFY",
          subject: `${subject}: ${funcName}`,
          description: `Function at line ${startLine} is ${lineCount} lines long. Consider breaking it into smaller, focused functions.`,
          files: [relativePath],
          location: `${relativePath}:${startLine}`,
          severity: "low",
          status: "pending",
          createdAt: new Date().toISOString(),
        });
        break; // Only report first long function
      }
    }

    // Check for TODO/FIXME comments
    const todoRegex = /\/\/\s*(TODO|FIXME|XXX|HACK):\s*(.+)/gi;
    let todoMatch;
    while ((todoMatch = todoRegex.exec(content)) !== null) {
      const lineNum = content.slice(0, todoMatch.index).split("\n").length;
      const todoText = todoMatch[2].trim();
      const subject = `${todoMatch[1].toUpperCase()}: ${todoText.slice(0, 30)}${todoText.length > 30 ? "..." : ""}`;

      criticisms.push({
        id: generateCriticismId("SIMPLIFY", subject, [relativePath]),
        category: "SIMPLIFY",
        subject,
        description: `Found ${todoMatch[1].toUpperCase()} comment: "${todoText}". Consider addressing this or removing if no longer relevant.`,
        files: [relativePath],
        location: `${relativePath}:${lineNum}`,
        severity: "low",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

  } catch {
    // Ignore read errors
  }

  return criticisms;
}
