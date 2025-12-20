/**
 * Clone Detection - finds duplicated code blocks
 *
 * Uses a simple hash-based approach to detect copy-paste code.
 * LLM-generated code has 4x more clones than human code.
 */

import { join, relative, extname } from "path";
import { readFileSync, readdirSync } from "fs";
import type { Criticism } from "../criticism/types";
import { generateCriticismId } from "../criticism/store";

export interface CloneResult {
  criticisms: Criticism[];
  totalClones: number;
  duplicatedLines: number;
}

interface CodeBlock {
  file: string;
  startLine: number;
  endLine: number;
  content: string;
  hash: string;
}

/**
 * Simple hash function for code blocks
 */
function hashCode(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Normalize code for comparison (remove whitespace variations)
 */
function normalizeCode(code: string): string {
  return code
    .replace(/\/\/.*$/gm, "") // Remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // Remove block comments
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Find source files
 */
function findSourceFiles(dir: string): string[] {
  const files: string[] = [];
  const skipDirs = ["node_modules", ".git", "dist", "build", ".crit", ".orchestra", "coverage"];

  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!skipDirs.includes(entry.name)) {
          files.push(...findSourceFiles(fullPath));
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
          if (!entry.name.includes(".test.") && !entry.name.includes(".spec.")) {
            files.push(fullPath);
          }
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return files;
}

/**
 * Extract code blocks from a file (sliding window of N lines)
 */
function extractBlocks(filePath: string, projectPath: string, minLines: number = 5): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  try {
    const content = readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relativePath = relative(projectPath, filePath);

    // Sliding window
    for (let i = 0; i <= lines.length - minLines; i++) {
      const blockLines = lines.slice(i, i + minLines);
      const blockContent = blockLines.join("\n");
      const normalized = normalizeCode(blockContent);

      // Skip blocks that are mostly empty or too short after normalization
      if (normalized.length < 50) continue;

      blocks.push({
        file: relativePath,
        startLine: i + 1,
        endLine: i + minLines,
        content: blockContent,
        hash: hashCode(normalized),
      });
    }
  } catch {
    // Ignore read errors
  }

  return blocks;
}

export async function detectCodeClones(projectPath: string): Promise<CloneResult> {
  const criticisms: Criticism[] = [];
  const minLines = 6; // Minimum lines for a clone

  try {
    const files = findSourceFiles(projectPath);
    const allBlocks: CodeBlock[] = [];

    // Extract blocks from all files
    for (const file of files) {
      allBlocks.push(...extractBlocks(file, projectPath, minLines));
    }

    // Group blocks by hash
    const hashGroups = new Map<string, CodeBlock[]>();
    for (const block of allBlocks) {
      const existing = hashGroups.get(block.hash) || [];
      existing.push(block);
      hashGroups.set(block.hash, existing);
    }

    // Find duplicates (hash appears more than once)
    let totalClones = 0;
    let duplicatedLines = 0;
    const reportedPairs = new Set<string>();

    for (const [hash, blocks] of hashGroups) {
      if (blocks.length < 2) continue;

      // Report first pair only to avoid noise
      const first = blocks[0]!;
      const second = blocks[1]!;

      // Create a unique key for this pair
      const pairKey = [first.file, second.file].sort().join("::");
      if (reportedPairs.has(pairKey)) continue;
      reportedPairs.add(pairKey);

      totalClones++;
      duplicatedLines += minLines;

      const isSameFile = first.file === second.file;
      const subject = `duplicated code block (${minLines}+ lines)`;

      const description = isSameFile
        ? `Found duplicated code within the same file. Lines ${first.startLine}-${first.endLine} and ${second.startLine}-${second.endLine} are nearly identical. Consider extracting to a shared function.`
        : `Found duplicated code across files. Similar code exists in both "${first.file}" and "${second.file}". Consider consolidating into a shared module.`;

      criticisms.push({
        id: generateCriticismId("SIMPLIFY", subject, [first.file, second.file]),
        category: "SIMPLIFY",
        subject,
        description,
        files: isSameFile ? [first.file] : [first.file, second.file],
        location: `${first.file}:${first.startLine}`,
        severity: "medium",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }

    return {
      criticisms,
      totalClones,
      duplicatedLines,
    };
  } catch {
    return {
      criticisms: [],
      totalClones: 0,
      duplicatedLines: 0,
    };
  }
}

/**
 * Quick check for a single file against the rest of the project
 */
export async function checkFileForClones(
  filePath: string,
  projectPath: string
): Promise<Criticism[]> {
  const result = await detectCodeClones(projectPath);
  // Filter to only clones involving this file
  return result.criticisms.filter((c) =>
    c.files.some((f) => f.includes(filePath) || filePath.includes(f))
  );
}
