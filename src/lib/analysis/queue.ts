/**
 * Analysis Queue - tracks files needing deep analysis
 *
 * Maintains a priority queue of files for LLM-based analysis.
 * Prioritizes recently changed, complex, or frequently modified files.
 */

import { join, relative } from "path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { searchForPattern, type SearchResult } from "../search";

export interface QueuedFile {
  path: string;
  priority: number;
  addedAt: string;
  reason: string;
  linesChanged?: number;
  complexity?: number;
}

export interface AnalysisContext {
  file: QueuedFile;
  content: string;
  imports: string[];
  searchResults: SearchResult[];
  projectRules: string[];
}

interface QueueState {
  files: QueuedFile[];
  analyzed: string[]; // Files recently analyzed (avoid re-analysis)
  lastUpdated: string;
}

const QUEUE_FILE = ".crit/state/analysis-queue.json";
const ANALYZED_TTL_MS = 60 * 60 * 1000; // 1 hour before re-analysis

/**
 * Load queue state
 */
function loadQueue(projectPath: string): QueueState {
  const queuePath = join(projectPath, QUEUE_FILE);
  if (!existsSync(queuePath)) {
    return { files: [], analyzed: [], lastUpdated: new Date().toISOString() };
  }

  try {
    return JSON.parse(readFileSync(queuePath, "utf-8"));
  } catch {
    return { files: [], analyzed: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Save queue state
 */
function saveQueue(projectPath: string, state: QueueState): void {
  const queuePath = join(projectPath, QUEUE_FILE);
  const dir = join(projectPath, ".crit/state");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(queuePath, JSON.stringify(state, null, 2));
}

/**
 * Add a file to the analysis queue
 */
export function queueFile(
  projectPath: string,
  filePath: string,
  options: {
    priority?: number;
    reason?: string;
    linesChanged?: number;
  } = {}
): void {
  const state = loadQueue(projectPath);
  const relativePath = filePath.startsWith("/")
    ? relative(projectPath, filePath)
    : filePath;

  // Check if already queued
  const existing = state.files.find((f) => f.path === relativePath);
  if (existing) {
    // Update priority if higher
    if (options.priority && options.priority > existing.priority) {
      existing.priority = options.priority;
      existing.reason = options.reason || existing.reason;
    }
    saveQueue(projectPath, state);
    return;
  }

  // Check if recently analyzed
  if (state.analyzed.includes(relativePath)) {
    return;
  }

  // Calculate priority based on factors
  let priority = options.priority || 50;
  if (options.linesChanged) {
    if (options.linesChanged > 100) priority += 30;
    else if (options.linesChanged > 50) priority += 20;
    else if (options.linesChanged > 20) priority += 10;
  }

  state.files.push({
    path: relativePath,
    priority,
    addedAt: new Date().toISOString(),
    reason: options.reason || "file changed",
    linesChanged: options.linesChanged,
  });

  // Sort by priority (highest first)
  state.files.sort((a, b) => b.priority - a.priority);

  // Keep queue reasonable size
  if (state.files.length > 100) {
    state.files = state.files.slice(0, 100);
  }

  state.lastUpdated = new Date().toISOString();
  saveQueue(projectPath, state);
}

/**
 * Get files ready for analysis with context
 */
export async function getAnalysisQueue(
  projectPath: string,
  limit: number = 3
): Promise<AnalysisContext[]> {
  const state = loadQueue(projectPath);
  const results: AnalysisContext[] = [];

  for (const file of state.files.slice(0, limit)) {
    const fullPath = join(projectPath, file.path);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf-8");

      // Extract imports for context
      const imports = extractImports(content);

      // Search online for patterns (based on file content keywords)
      const keywords = extractKeywords(content);
      let searchResults: SearchResult[] = [];
      if (keywords.length > 0) {
        searchResults = await searchForPattern(projectPath, keywords.join(" "));
      }

      // Load project rules
      const projectRules = loadProjectRules(projectPath);

      results.push({
        file,
        content,
        imports,
        searchResults,
        projectRules,
      });
    } catch {
      // Skip files with read errors
    }
  }

  return results;
}

/**
 * Mark a file as analyzed
 */
export function markAnalyzed(projectPath: string, filePath: string): void {
  const state = loadQueue(projectPath);
  const relativePath = filePath.startsWith("/")
    ? relative(projectPath, filePath)
    : filePath;

  // Remove from queue
  state.files = state.files.filter((f) => f.path !== relativePath);

  // Add to analyzed list
  if (!state.analyzed.includes(relativePath)) {
    state.analyzed.push(relativePath);
  }

  // Clean old analyzed entries
  state.analyzed = state.analyzed.slice(-50); // Keep last 50

  state.lastUpdated = new Date().toISOString();
  saveQueue(projectPath, state);
}

/**
 * Get queue size
 */
export function getQueueSize(projectPath: string): number {
  const state = loadQueue(projectPath);
  return state.files.length;
}

/**
 * Extract import statements from content
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.trim().startsWith("import ")) {
      imports.push(line.trim());
    }
  }

  return imports;
}

/**
 * Extract keywords from code for search
 */
function extractKeywords(content: string): string[] {
  const keywords = new Set<string>();

  // Look for specific patterns that might benefit from online search
  const patterns = [
    /async\s+function/g,
    /\.then\s*\(/g,
    /try\s*{/g,
    /catch\s*\(/g,
    /Promise\./g,
    /fetch\s*\(/g,
    /useState|useEffect|useCallback/g,
    /readFile|writeFile/g,
    /express|koa|fastify/g,
    /socket|websocket/gi,
  ];

  for (const pattern of patterns) {
    if (pattern.test(content)) {
      const keyword = pattern.source
        .replace(/\\s\*/g, " ")
        .replace(/[^a-zA-Z]/g, " ")
        .trim();
      if (keyword.length > 2) {
        keywords.add(keyword);
      }
    }
  }

  return Array.from(keywords).slice(0, 3);
}

/**
 * Load project rules from CLAUDE.md
 */
function loadProjectRules(projectPath: string): string[] {
  const rules: string[] = [];
  const claudeMdPath = join(projectPath, "CLAUDE.md");

  if (existsSync(claudeMdPath)) {
    try {
      const content = readFileSync(claudeMdPath, "utf-8");
      // Extract lines that look like rules
      const lines = content.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (
          trimmed.startsWith("- ") &&
          (trimmed.includes("use") ||
            trimmed.includes("prefer") ||
            trimmed.includes("avoid") ||
            trimmed.includes("don't") ||
            trimmed.includes("always"))
        ) {
          rules.push(trimmed.slice(2));
        }
      }
    } catch {
      // Ignore errors
    }
  }

  return rules;
}
