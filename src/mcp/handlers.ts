/**
 * MCP Tool handlers for crit
 */

import { join } from "path";
import type { HistoryEntry, Initiative } from "../lib/state/types";
import { parseRules } from "../lib/rules/parser";
import {
  generateOverview,
  generateLLMContext,
  formatOverviewMarkdown,
} from "../lib/overview";
import {
  analyzeProject,
  analyzeFile,
  checkProposedCode,
} from "../lib/bloat";
import {
  getTestStatus,
  getTestRequirements,
  verifyTests,
  type TestStatus,
  type TestRequirement,
  type TestResult,
} from "../lib/testing";
import {
  loadPreferences,
  parsePreferences,
  type ParsedPreference,
} from "../lib/criticism/preferences";
import {
  loadStatus,
  parseStatus,
  addDeliverable,
  markDeliverableDone,
  addInsight,
  setFocus,
  type ProjectStatus,
} from "../lib/criticism/status";
import {
  addCriticism,
  getPendingCriticisms,
  getCriticismsByCategory,
  generateCriticismId,
} from "../lib/criticism/store";
import type { Criticism, CriticismCategory } from "../lib/criticism/types";
import {
  getAnalysisQueue,
  markAnalyzed,
  getQueueSize,
  type AnalysisContext,
} from "../lib/analysis/queue";
import {
  searchForPattern,
  type SearchResult,
} from "../lib/search";

// Get project path from env or cwd
function getProjectPath(): string {
  return process.env.CRIT_PROJECT || process.cwd();
}

// Paths within the project
function getCritDir(projectPath: string): string {
  return join(projectPath, ".crit");
}

function getRulesPath(projectPath: string): string {
  return join(getCritDir(projectPath), "rules.md");
}

function getContextDir(projectPath: string): string {
  return join(getCritDir(projectPath), "context");
}

function getHistoryPath(projectPath: string): string {
  return join(getCritDir(projectPath), "state", "history.json");
}

function getInitiativesPath(projectPath: string): string {
  return join(getCritDir(projectPath), "state", "initiatives.json");
}

/**
 * Load rules from .crit/rules.md
 */
async function loadRules(projectPath: string): Promise<string> {
  const rulesPath = getRulesPath(projectPath);
  const file = Bun.file(rulesPath);

  if (!(await file.exists())) {
    return "No rules defined yet.";
  }

  return await file.text();
}

/**
 * Load context files from .crit/context/
 */
async function loadContext(projectPath: string): Promise<string> {
  const contextDir = getContextDir(projectPath);

  try {
    const glob = new Bun.Glob("*.md");
    const files: string[] = [];

    for await (const file of glob.scan({ cwd: contextDir })) {
      const filePath = join(contextDir, file);
      const content = await Bun.file(filePath).text();
      files.push(`## ${file}\n\n${content}`);
    }

    if (files.length === 0) {
      return "No context documentation yet.";
    }

    return files.join("\n\n---\n\n");
  } catch {
    return "No context documentation yet.";
  }
}

/**
 * Load recent history
 */
async function loadHistory(projectPath: string): Promise<HistoryEntry[]> {
  const historyPath = getHistoryPath(projectPath);
  const file = Bun.file(historyPath);

  if (!(await file.exists())) {
    return [];
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as HistoryEntry[];
  } catch {
    return [];
  }
}

/**
 * Save history
 */
async function saveHistory(
  projectPath: string,
  history: HistoryEntry[]
): Promise<void> {
  const historyPath = getHistoryPath(projectPath);
  // Ensure directory exists
  const dir = join(getCritDir(projectPath), "state");
  await Bun.write(join(dir, ".keep"), "");
  await Bun.write(historyPath, JSON.stringify(history, null, 2));
}

/**
 * Load initiatives
 */
async function loadInitiatives(projectPath: string): Promise<Initiative[]> {
  const initiativesPath = getInitiativesPath(projectPath);
  const file = Bun.file(initiativesPath);

  if (!(await file.exists())) {
    return [];
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as Initiative[];
  } catch {
    return [];
  }
}

/**
 * Save initiatives
 */
async function saveInitiatives(
  projectPath: string,
  initiatives: Initiative[]
): Promise<void> {
  const initiativesPath = getInitiativesPath(projectPath);
  const dir = join(getCritDir(projectPath), "state");
  await Bun.write(join(dir, ".keep"), "");
  await Bun.write(initiativesPath, JSON.stringify(initiatives, null, 2));
}

/**
 * Generate a simple ID
 */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Tool Handlers

export type GetContextResult = {
  rules: string;
  context: string;
  history: string;
};

export async function handleGetContext(): Promise<GetContextResult> {
  const projectPath = getProjectPath();

  const rules = await loadRules(projectPath);
  const context = await loadContext(projectPath);
  const history = await loadHistory(projectPath);

  // Format recent history (last 10 entries)
  const recentHistory = history.slice(-10);
  const historyStr =
    recentHistory.length > 0
      ? recentHistory
          .map(
            (h) =>
              `[${h.timestamp}] ${h.action}: ${h.description} (${h.files.length} files)`
          )
          .join("\n")
      : "No recent history.";

  return {
    rules,
    context,
    history: historyStr,
  };
}

export type CheckRulesInput = {
  description: string;
};

export type CheckRulesResult = {
  suggestions: string[];
};

export async function handleCheckRules(
  input: CheckRulesInput
): Promise<CheckRulesResult> {
  const projectPath = getProjectPath();
  const rulesContent = await loadRules(projectPath);

  if (rulesContent === "No rules defined yet.") {
    return { suggestions: [] };
  }

  const rulesFile = parseRules(rulesContent);
  const suggestions: string[] = [];

  // Simple keyword matching for now
  // A more sophisticated implementation would use semantic matching
  const descLower = input.description.toLowerCase();

  for (const rule of rulesFile.rules) {
    if (!rule.enabled) continue;

    const ruleLower = rule.text.toLowerCase();
    const keywords = ruleLower.split(/\s+/).filter((w) => w.length > 4);

    // Check if any keywords from the rule appear in the description
    const matches = keywords.some(
      (keyword) =>
        descLower.includes(keyword) || ruleLower.includes(descLower.slice(0, 20))
    );

    if (matches) {
      suggestions.push(`[${rule.section}] ${rule.text}`);
    }
  }

  return { suggestions };
}

export type LogActionInput = {
  action: string;
  description: string;
  files: string[];
};

export type LogActionResult = {
  success: boolean;
};

export async function handleLogAction(
  input: LogActionInput
): Promise<LogActionResult> {
  const projectPath = getProjectPath();

  const history = await loadHistory(projectPath);

  const entry: HistoryEntry = {
    timestamp: new Date().toISOString(),
    action: input.action as HistoryEntry["action"],
    description: input.description,
    files: input.files,
  };

  history.push(entry);

  // Keep only last 100 entries
  const trimmedHistory = history.slice(-100);

  await saveHistory(projectPath, trimmedHistory);

  return { success: true };
}

export type AddInitiativeInput = {
  type: string;
  description: string;
  priority: string;
};

export type AddInitiativeResult = {
  id: string;
};

export async function handleAddInitiative(
  input: AddInitiativeInput
): Promise<AddInitiativeResult> {
  const projectPath = getProjectPath();

  const initiatives = await loadInitiatives(projectPath);

  const id = generateId();
  const initiative: Initiative = {
    id,
    priority: input.priority as Initiative["priority"],
    type: input.type as Initiative["type"],
    description: input.description,
    files: [],
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  initiatives.push(initiative);
  await saveInitiatives(projectPath, initiatives);

  return { id };
}

export type UpdateContextInput = {
  file: string;
  content: string;
};

export type UpdateContextResult = {
  success: boolean;
};

export async function handleUpdateContext(
  input: UpdateContextInput
): Promise<UpdateContextResult> {
  const projectPath = getProjectPath();
  const contextDir = getContextDir(projectPath);

  // Sanitize filename
  const filename = input.file.replace(/[^a-zA-Z0-9_.-]/g, "_");
  const filePath = join(contextDir, filename);

  // Ensure .md extension
  const finalPath = filePath.endsWith(".md") ? filePath : `${filePath}.md`;

  await Bun.write(finalPath, input.content);

  return { success: true };
}

export type GetOverviewInput = {
  format?: "full" | "llm" | "structure";
};

export type GetOverviewResult = {
  overview: string;
  format: string;
};

export async function handleGetOverview(
  input: GetOverviewInput
): Promise<GetOverviewResult> {
  const projectPath = getProjectPath();
  const format = input.format || "llm";

  const overview = await generateOverview(projectPath);

  let result: string;
  switch (format) {
    case "full":
      result = formatOverviewMarkdown(overview, projectPath);
      break;
    case "structure":
      result = overview.structure;
      break;
    case "llm":
    default:
      result = await generateLLMContext(projectPath);
      break;
  }

  return {
    overview: result,
    format,
  };
}

export type CheckBloatInput = {
  file?: string;
};

export type CheckBloatResult = {
  issues: Array<{
    type: string;
    file: string;
    line?: number;
    description: string;
    suggestion: string;
    severity: string;
  }>;
  score: number;
  summary: string;
};

export async function handleCheckBloat(
  input: CheckBloatInput
): Promise<CheckBloatResult> {
  const projectPath = getProjectPath();

  if (input.file) {
    // Analyze single file
    const filePath = input.file.startsWith("/")
      ? input.file
      : join(projectPath, input.file);
    const issues = await analyzeFile(filePath);

    // Calculate score for single file
    const severityWeights = { low: 1, medium: 3, high: 5 };
    const score = Math.min(
      100,
      issues.reduce((sum, i) => sum + severityWeights[i.severity], 0) * 2
    );

    return {
      issues,
      score,
      summary:
        issues.length === 0
          ? "No bloat detected in this file."
          : `Found ${issues.length} issue(s) in ${input.file}`,
    };
  }

  // Analyze entire project
  return await analyzeProject(projectPath);
}

export type CheckProposedCodeInput = {
  code: string;
  context: string;
};

export type CheckProposedCodeResult = {
  isOverEngineered: boolean;
  issues: string[];
  simplerAlternative?: string;
};

export async function handleCheckProposedCode(
  input: CheckProposedCodeInput
): Promise<CheckProposedCodeResult> {
  return await checkProposedCode(input.code, input.context);
}

export type CheckTestsInput = {
  files?: string[];
  verify?: boolean;
};

export type CheckTestsResult = {
  status: TestStatus;
  requirements?: TestRequirement[];
  testResult?: TestResult;
};

export async function handleCheckTests(
  input: CheckTestsInput
): Promise<CheckTestsResult> {
  const projectPath = getProjectPath();

  // Get full test status for the project
  const status = await getTestStatus(projectPath);

  // If specific files provided, get their requirements
  let requirements: TestRequirement[] | undefined;
  if (input.files && input.files.length > 0) {
    requirements = await getTestRequirements(projectPath, input.files);
  }

  // If verify requested, run tests
  let testResult: TestResult | undefined;
  if (input.verify) {
    testResult = await verifyTests(projectPath);
  }

  return {
    status,
    requirements,
    testResult,
  };
}

// ============================================================
// Criticism system handlers
// ============================================================

export type GetPreferencesResult = {
  preferences: ParsedPreference[];
  raw: string;
};

export async function handleGetPreferences(): Promise<GetPreferencesResult> {
  const projectPath = getProjectPath();
  const raw = loadPreferences(projectPath);
  const preferences = parsePreferences(projectPath);

  return {
    preferences,
    raw,
  };
}

export type GetStatusResult = {
  status: ProjectStatus;
  raw: string;
};

export async function handleGetStatus(): Promise<GetStatusResult> {
  const projectPath = getProjectPath();
  const raw = loadStatus(projectPath);
  const status = parseStatus(projectPath);

  return {
    status,
    raw,
  };
}

export type AddCriticismInput = {
  category: CriticismCategory;
  subject: string;
  description: string;
  files: string[];
  location?: string;
  severity: "low" | "medium" | "high";
  diff?: string;
};

export type AddCriticismResult = {
  id: string;
  success: boolean;
};

export async function handleAddCriticism(
  input: AddCriticismInput
): Promise<AddCriticismResult> {
  const projectPath = getProjectPath();

  const id = generateCriticismId(input.category, input.subject, input.files);

  const criticism: Criticism = {
    id,
    category: input.category,
    subject: input.subject,
    description: input.description,
    files: input.files,
    location: input.location,
    severity: input.severity,
    status: "pending",
    diff: input.diff,
    createdAt: new Date().toISOString(),
  };

  addCriticism(projectPath, criticism);

  return {
    id,
    success: true,
  };
}

export type GetCriticismsInput = {
  category?: CriticismCategory;
};

export type GetCriticismsResult = {
  criticisms: Criticism[];
  count: number;
};

export async function handleGetCriticisms(
  input: GetCriticismsInput
): Promise<GetCriticismsResult> {
  const projectPath = getProjectPath();

  let criticisms: Criticism[];
  if (input.category) {
    criticisms = getCriticismsByCategory(projectPath, input.category);
  } else {
    criticisms = getPendingCriticisms(projectPath);
  }

  return {
    criticisms,
    count: criticisms.length,
  };
}

export type UpdateStatusInput = {
  addDeliverable?: string;
  markDone?: string;
  addInsight?: string;
  setFocus?: string;
};

export type UpdateStatusResult = {
  success: boolean;
  updated: string[];
};

export async function handleUpdateStatus(
  input: UpdateStatusInput
): Promise<UpdateStatusResult> {
  const projectPath = getProjectPath();
  const updated: string[] = [];

  if (input.addDeliverable) {
    addDeliverable(projectPath, input.addDeliverable);
    updated.push(`Added deliverable: ${input.addDeliverable}`);
  }

  if (input.markDone) {
    markDeliverableDone(projectPath, input.markDone);
    updated.push(`Marked done: ${input.markDone}`);
  }

  if (input.addInsight) {
    addInsight(projectPath, input.addInsight);
    updated.push(`Added insight: ${input.addInsight}`);
  }

  if (input.setFocus) {
    setFocus(projectPath, input.setFocus);
    updated.push(`Set focus: ${input.setFocus}`);
  }

  return {
    success: updated.length > 0,
    updated,
  };
}

// ============================================================
// Deep analysis handlers
// ============================================================

export type GetAnalysisQueueInput = {
  limit?: number;
};

export type GetAnalysisQueueResult = {
  files: Array<{
    path: string;
    priority: number;
    reason: string;
    content: string;
    imports: string[];
    searchResults: SearchResult[];
    projectRules: string[];
  }>;
  queueSize: number;
  instructions: string;
};

export async function handleGetAnalysisQueue(
  input: GetAnalysisQueueInput
): Promise<GetAnalysisQueueResult> {
  const projectPath = getProjectPath();
  const limit = input.limit || 3;

  const queue = await getAnalysisQueue(projectPath, limit);
  const queueSize = getQueueSize(projectPath);

  return {
    files: queue.map((ctx) => ({
      path: ctx.file.path,
      priority: ctx.file.priority,
      reason: ctx.file.reason,
      content: ctx.content,
      imports: ctx.imports,
      searchResults: ctx.searchResults,
      projectRules: ctx.projectRules,
    })),
    queueSize,
    instructions: `
Analyze each file for:
1. **Simplification opportunities**: Code that works but could be shorter/cleaner
2. **Pattern improvements**: Better ways to do the same thing (based on search results)
3. **Consistency issues**: Does this match how similar things are done elsewhere?
4. **Project rule violations**: Does this follow the project rules listed?

For each issue found, use crit_add_criticism to log it.
After analyzing a file, use crit_mark_analyzed to remove it from the queue.

Focus on semantic improvements, not syntax/formatting. If the search results
show a better pattern or warn about a gotcha, include that in the criticism.
`,
  };
}

export type MarkAnalyzedInput = {
  file: string;
};

export type MarkAnalyzedResult = {
  success: boolean;
};

export async function handleMarkAnalyzed(
  input: MarkAnalyzedInput
): Promise<MarkAnalyzedResult> {
  const projectPath = getProjectPath();
  markAnalyzed(projectPath, input.file);
  return { success: true };
}

export type SearchOnlineInput = {
  query: string;
  language?: string;
};

export type SearchOnlineResult = {
  results: SearchResult[];
  summary: string;
};

export async function handleSearchOnline(
  input: SearchOnlineInput
): Promise<SearchOnlineResult> {
  const projectPath = getProjectPath();

  const results = await searchForPattern(projectPath, input.query, {
    language: input.language || "typescript",
  });

  // Build a summary of the findings
  const summaryParts: string[] = [];
  const redditResults = results.filter((r) => r.source === "reddit");
  const soResults = results.filter((r) => r.source === "stackoverflow");

  if (redditResults.length > 0) {
    summaryParts.push(
      `Found ${redditResults.length} Reddit discussions. Top: "${redditResults[0]?.title || ""}"`
    );
  }

  if (soResults.length > 0) {
    summaryParts.push(
      `Found ${soResults.length} Stack Overflow answers. Top: "${soResults[0]?.title || ""}"`
    );
  }

  return {
    results,
    summary:
      summaryParts.length > 0
        ? summaryParts.join(". ")
        : "No relevant results found.",
  };
}
