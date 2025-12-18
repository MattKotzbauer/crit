import { extname, dirname, basename } from "path";
import type { WatchEvent } from "./watcher";

export interface ProcessResult {
  action: "none" | "update_context" | "check_rules" | "suggest_test";
  details: string;
}

// Debounce state
const pendingChanges = new Map<string, WatchEvent>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let processingCallback: ((events: WatchEvent[]) => void) | null = null;

const DEBOUNCE_MS = 100;

/**
 * Queue a change event for processing (with debouncing)
 */
export function queueChange(event: WatchEvent): void {
  // Store/update the pending change for this path
  pendingChanges.set(event.path, event);

  // Reset debounce timer
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    const events = Array.from(pendingChanges.values());
    pendingChanges.clear();
    debounceTimer = null;

    if (processingCallback && events.length > 0) {
      processingCallback(events);
    }
  }, DEBOUNCE_MS);
}

/**
 * Set the callback for processing batched events
 */
export function setProcessingCallback(
  callback: (events: WatchEvent[]) => void
): void {
  processingCallback = callback;
}

/**
 * Clear any pending debounced changes
 */
export function clearPendingChanges(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingChanges.clear();
}

/**
 * Determine what action to take for a file change
 */
export async function processChange(
  event: WatchEvent,
  _projectPath: string
): Promise<ProcessResult> {
  const ext = extname(event.path);
  const dir = dirname(event.path);
  const filename = basename(event.path);

  // Deleted files - just note it
  if (event.type === "unlink") {
    return {
      action: "update_context",
      details: `File removed: ${event.path}`,
    };
  }

  // Config file changes
  if (
    filename === "package.json" ||
    filename === "tsconfig.json" ||
    filename === "bun.lock"
  ) {
    return {
      action: "update_context",
      details: `Config changed: ${event.path}`,
    };
  }

  // Documentation changes
  if (ext === ".md") {
    return {
      action: "update_context",
      details: `Documentation ${event.type === "add" ? "added" : "updated"}: ${event.path}`,
    };
  }

  // Test file changes
  if (
    filename.includes(".test.") ||
    filename.includes(".spec.") ||
    dir.includes("__tests__")
  ) {
    return {
      action: "check_rules",
      details: `Test file ${event.type === "add" ? "added" : "modified"}: ${event.path}`,
    };
  }

  // Source file changes - suggest tests if new
  if ([".ts", ".tsx", ".js", ".jsx"].includes(ext)) {
    if (event.type === "add") {
      return {
        action: "suggest_test",
        details: `New source file: ${event.path}`,
      };
    }
    return {
      action: "check_rules",
      details: `Source file modified: ${event.path}`,
    };
  }

  // Default - no action needed
  return {
    action: "none",
    details: `File ${event.type}: ${event.path}`,
  };
}

/**
 * Process a batch of changes and return results
 */
export async function processBatch(
  events: WatchEvent[],
  projectPath: string
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  for (const event of events) {
    const result = await processChange(event, projectPath);
    results.push(result);
  }

  return results;
}
