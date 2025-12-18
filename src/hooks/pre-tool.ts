/**
 * PreToolUse hook handler
 *
 * Triggered BEFORE Claude uses a tool. Can:
 * - Inject context about rules
 * - Warn about potential issues
 * - Block if necessary (return non-zero)
 */

import type { PreToolInput, PreToolOutput } from "./types";
import { critExists } from "../lib/paths";
import { loadRules, formatForLLM } from "../lib/rules/manager";

/**
 * Check if a file path looks like a test file
 */
function isTestFile(filePath: string): boolean {
  return (
    filePath.includes(".test.") ||
    filePath.includes(".spec.") ||
    filePath.includes("__tests__") ||
    filePath.includes("/test/") ||
    filePath.includes("/tests/")
  );
}

/**
 * Check if a file should have tests
 */
function shouldHaveTests(filePath: string): boolean {
  // Skip test files, type files, config files
  if (isTestFile(filePath)) return false;
  if (filePath.endsWith(".d.ts")) return false;
  if (filePath.includes("/types")) return false;
  if (filePath.includes("config")) return false;
  if (filePath.endsWith(".json")) return false;
  if (filePath.endsWith(".md")) return false;

  // Source files that likely need tests
  return (
    filePath.endsWith(".ts") ||
    filePath.endsWith(".tsx") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx")
  );
}

/**
 * Check if a bash command is running tests
 */
function isTestCommand(command: string): boolean {
  const testPatterns = [
    /\bbun\s+test\b/,
    /\bnpm\s+test\b/,
    /\bnpm\s+run\s+test\b/,
    /\byarn\s+test\b/,
    /\bpnpm\s+test\b/,
    /\bpytest\b/,
    /\bjest\b/,
    /\bvitest\b/,
    /\bmocha\b/,
    /\bava\b/,
  ];

  return testPatterns.some((pattern) => pattern.test(command));
}

/**
 * Handle PreToolUse hook
 */
export async function handlePreTool(
  input: PreToolInput,
  projectPath: string = process.cwd()
): Promise<PreToolOutput> {
  const messages: string[] = [];

  // If crit is not initialized, just allow
  if (!critExists(projectPath)) {
    return { decision: "approve" };
  }

  // Load rules and add context
  try {
    const rules = await loadRules(projectPath);
    const rulesContext = formatForLLM(rules);

    if (rulesContext) {
      messages.push(`[crit] Active project rules:\n${rulesContext}`);
    }
  } catch {
    // Ignore rule loading errors
  }

  // Handle specific tools
  const tool = input.tool_name;
  const toolInput = input.tool_input;

  if (tool === "Write" || tool === "Edit") {
    const filePath = (toolInput.file_path as string) || "";

    if (shouldHaveTests(filePath)) {
      const testPath = filePath.replace(/\.(ts|tsx|js|jsx)$/, ".test.$1");
      messages.push(
        `[crit] Reminder: ${filePath} should have corresponding tests. ` +
        `Consider updating ${testPath} if behavior changes.`
      );
    }
  }

  if (tool === "Bash") {
    const command = (toolInput.command as string) || "";

    if (isTestCommand(command)) {
      messages.push(`[crit] Test run detected. Results will be tracked.`);
    }
  }

  // Return approval with any messages
  if (messages.length > 0) {
    return {
      decision: "approve",
      reason: messages.join("\n\n"),
    };
  }

  return { decision: "approve" };
}
