/**
 * Rule Enforcement - checks code against project rules
 *
 * Parses CLAUDE.md and .crit/rules.md for project-specific rules,
 * then checks if code violates them.
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Criticism } from "../criticism/types";
import { generateCriticismId } from "../criticism/store";

export interface ProjectRule {
  type: "prefer" | "avoid" | "require" | "convention";
  pattern: string;
  description: string;
  source: string;
}

interface RuleViolation {
  rule: ProjectRule;
  file: string;
  line: number;
  context: string;
}

/**
 * Common rules extracted from CLAUDE.md patterns
 */
const COMMON_RULE_PATTERNS: Array<{
  match: RegExp;
  extract: (match: RegExpMatchArray) => ProjectRule | null;
}> = [
  // "Use X instead of Y" patterns
  {
    match: /use\s+[`"]?(\w+(?:\.\w+)?)[`"]?\s+instead\s+of\s+[`"]?(\w+(?:\.\w+)?)[`"]?/gi,
    extract: (m) => ({
      type: "prefer",
      pattern: m[2]!, // avoid this
      description: `Use ${m[1]} instead of ${m[2]}`,
      source: "CLAUDE.md",
    }),
  },
  // "Don't use X" patterns
  {
    match: /(?:don't|do not|never)\s+use\s+[`"]?(\w+(?:\.\w+)?)[`"]?/gi,
    extract: (m) => ({
      type: "avoid",
      pattern: m[1]!,
      description: `Avoid using ${m[1]}`,
      source: "CLAUDE.md",
    }),
  },
  // "Prefer X over Y" patterns
  {
    match: /prefer\s+[`"]?(\w+(?:\.\w+)?)[`"]?\s+(?:over|to)\s+[`"]?(\w+(?:\.\w+)?)[`"]?/gi,
    extract: (m) => ({
      type: "prefer",
      pattern: m[2]!,
      description: `Prefer ${m[1]} over ${m[2]}`,
      source: "CLAUDE.md",
    }),
  },
  // "Always use X" patterns
  {
    match: /always\s+use\s+[`"]?(\w+(?:\.\w+)?)[`"]?/gi,
    extract: (m) => ({
      type: "require",
      pattern: m[1]!,
      description: `Always use ${m[1]}`,
      source: "CLAUDE.md",
    }),
  },
];

/**
 * Known substitution rules (common in Bun projects)
 * These patterns match import statements specifically
 */
const KNOWN_SUBSTITUTIONS: Array<{
  avoid: RegExp;
  prefer: string;
  description: string;
}> = [
  { avoid: /^\s*import\s+.*from\s+["']express["']/, prefer: "Bun.serve", description: "Use Bun.serve instead of express" },
  { avoid: /^\s*import\s+.*from\s+["']node-fetch["']/, prefer: "fetch", description: "Use native fetch instead of node-fetch" },
  { avoid: /^\s*import\s+.*from\s+["']axios["']/, prefer: "fetch", description: "Use native fetch instead of axios" },
  { avoid: /^\s*import\s+.*from\s+["']better-sqlite3["']/, prefer: "bun:sqlite", description: "Use bun:sqlite instead of better-sqlite3" },
  { avoid: /^\s*import\s+.*from\s+["']ws["']/, prefer: "WebSocket", description: "Use native WebSocket instead of ws" },
  { avoid: /^\s*import\s+.*from\s+["']dotenv["']/, prefer: "Bun auto-loads .env", description: "Bun auto-loads .env, dotenv not needed" },
  { avoid: /^\s*import\s+.*from\s+["']ioredis["']/, prefer: "Bun.redis", description: "Use Bun.redis instead of ioredis" },
  { avoid: /^\s*import\s+.*from\s+["']pg["']/, prefer: "Bun.sql", description: "Use Bun.sql instead of pg" },
  { avoid: /^\s*(?:const|let|var)\s+\w+\s*=\s*require\s*\(\s*["']fs["']\s*\)/, prefer: "Bun.file", description: "Use Bun.file instead of require('fs')" },
];

/**
 * Find and parse CLAUDE.md files in project
 */
export function findClaudeMdFiles(projectPath: string): string[] {
  const paths: string[] = [];

  // Check common locations
  const locations = [
    join(projectPath, "CLAUDE.md"),
    join(projectPath, ".claude", "CLAUDE.md"),
    join(projectPath, ".crit", "rules.md"),
  ];

  for (const loc of locations) {
    if (existsSync(loc)) {
      paths.push(loc);
    }
  }

  return paths;
}

/**
 * Extract rules from CLAUDE.md content
 */
export function extractRules(content: string, source: string): ProjectRule[] {
  const rules: ProjectRule[] = [];

  for (const { match, extract } of COMMON_RULE_PATTERNS) {
    match.lastIndex = 0;
    let m;
    while ((m = match.exec(content)) !== null) {
      const rule = extract(m);
      if (rule) {
        rule.source = source;
        rules.push(rule);
      }
    }
  }

  return rules;
}

/**
 * Load all project rules
 */
export function loadProjectRules(projectPath: string): ProjectRule[] {
  const rules: ProjectRule[] = [];

  const claudeMdFiles = findClaudeMdFiles(projectPath);
  for (const file of claudeMdFiles) {
    try {
      const content = readFileSync(file, "utf-8");
      rules.push(...extractRules(content, file));
    } catch {
      // Ignore read errors
    }
  }

  return rules;
}

/**
 * Check a file for rule violations
 */
export function checkFileAgainstRules(
  filePath: string,
  projectPath: string
): Criticism[] {
  const criticisms: Criticism[] = [];

  // Skip non-source files
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relativePath = filePath.replace(projectPath + "/", "");

    // Check known substitutions (especially relevant for Bun projects)
    for (const sub of KNOWN_SUBSTITUTIONS) {
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;

        if (sub.avoid.test(line)) {
          const subject = sub.description;
          criticisms.push({
            id: generateCriticismId("SIMPLIFY", subject, [relativePath]),
            category: "SIMPLIFY",
            subject,
            description: `${sub.description}. Found import that could use a native/preferred alternative.`,
            files: [relativePath],
            location: `${relativePath}:${i + 1}`,
            severity: "low",
            status: "pending",
            createdAt: new Date().toISOString(),
          });
          found = true;
          break; // Only report once per file
        }
      }
      if (found) break;
    }

    // Check project-specific rules from CLAUDE.md
    // Only check "avoid" rules against import statements
    const projectRules = loadProjectRules(projectPath);
    for (const rule of projectRules) {
      if (rule.type === "avoid") {
        // Build a pattern that matches imports of this package
        const escapedPattern = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const importPattern = new RegExp(
          `^\\s*import\\s+.*from\\s+["']${escapedPattern}["']|^\\s*import\\s+["']${escapedPattern}["']`,
          "i"
        );

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && importPattern.test(line)) {
            criticisms.push({
              id: generateCriticismId("SIMPLIFY", rule.description, [relativePath]),
              category: "SIMPLIFY",
              subject: rule.description,
              description: `Rule from ${rule.source}: ${rule.description}. Consider using the recommended alternative.`,
              files: [relativePath],
              location: `${relativePath}:${i + 1}`,
              severity: "medium",
              status: "pending",
              createdAt: new Date().toISOString(),
            });
            break;
          }
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return criticisms;
}
