/**
 * PostToolUse hook handler
 *
 * Triggered AFTER Claude uses a tool. Can:
 * - Log actions to history
 * - Update context/overview
 * - Queue initiatives
 */

import type { PostToolInput } from "./types";
import { critExists } from "../lib/paths";
import { appendHistory } from "../lib/state/history";
import { updateSession, loadSession } from "../lib/state/session";
import { addInitiative } from "../lib/state/initiatives";

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
 * Extract file path from tool input
 */
function getFilePath(toolInput: Record<string, unknown>): string | null {
  if (typeof toolInput.file_path === "string") {
    return toolInput.file_path;
  }
  if (typeof toolInput.path === "string") {
    return toolInput.path;
  }
  return null;
}

/**
 * Handle PostToolUse hook
 */
export async function handlePostTool(
  input: PostToolInput,
  projectPath: string = process.cwd()
): Promise<void> {
  // If crit is not initialized, skip
  if (!critExists(projectPath)) {
    return;
  }

  const tool = input.tool_name;
  const toolInput = input.tool_input;

  try {
    // Handle file writes/edits
    if (tool === "Write" || tool === "Edit") {
      const filePath = getFilePath(toolInput);

      if (filePath) {
        // Log to history
        await appendHistory(projectPath, {
          action: "update_docs",
          description: `${tool}: ${filePath}`,
          files: [filePath],
        });

        // Update session focus
        await updateSession(projectPath, {
          currentFocus: filePath,
        });

        // If this is a source file (not a test), queue a reminder to test
        if (!isTestFile(filePath) && shouldQueueTestReminder(filePath)) {
          await addInitiative(projectPath, {
            priority: "medium",
            type: "suggest",
            description: `Consider testing changes to ${filePath}`,
            files: [filePath],
          });
        }
      }
    }

    // Handle bash commands
    if (tool === "Bash") {
      const command = (toolInput.command as string) || "";

      if (isTestCommand(command)) {
        // Log test run
        await appendHistory(projectPath, {
          action: "fix",
          description: `Test run: ${command.slice(0, 100)}`,
          files: [],
        });

        // Update session stats
        const session = await loadSession(projectPath);
        await updateSession(projectPath, {
          stats: {
            ...session.stats,
            rulesApplied: session.stats.rulesApplied + 1,
          },
        });
      }
    }

    // Handle read operations - update current focus
    if (tool === "Read") {
      const filePath = getFilePath(toolInput);
      if (filePath) {
        await updateSession(projectPath, {
          currentFocus: filePath,
        });
      }
    }
  } catch {
    // Don't let logging errors break the hook
    // Silently continue
  }
}

/**
 * Check if we should queue a test reminder for this file
 */
function shouldQueueTestReminder(filePath: string): boolean {
  // Skip non-source files
  if (filePath.endsWith(".json")) return false;
  if (filePath.endsWith(".md")) return false;
  if (filePath.endsWith(".d.ts")) return false;
  if (filePath.includes("/types")) return false;
  if (filePath.includes("config")) return false;

  // Only for TypeScript/JavaScript source files
  return (
    filePath.endsWith(".ts") ||
    filePath.endsWith(".tsx") ||
    filePath.endsWith(".js") ||
    filePath.endsWith(".jsx")
  );
}
