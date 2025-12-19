import { createWatcher, type WatchEvent } from "./watcher";
import {
  queueChange,
  setProcessingCallback,
  clearPendingChanges,
  processBatch,
} from "./processor";
import { reportActions } from "./reporter";
import { appendHistory } from "../lib/state/history";
import { analyzeChanges } from "./analyzer";

export interface DaemonHandle {
  stop: () => void;
}

export interface DaemonOptions {
  /** Callback when a file change is detected */
  onEvent?: (event: WatchEvent) => void;
  /** Callback when actions are processed */
  onActions?: (actions: Array<{ action: string; details: string }>) => void;
  /** Callback when criticisms are generated */
  onCriticisms?: (count: number) => void;
  /** Whether to write to history (default: true) */
  writeHistory?: boolean;
  /** Whether to write reports (default: true) */
  writeReports?: boolean;
  /** Whether to analyze for criticisms (default: true) */
  analyzeCriticisms?: boolean;
}

/**
 * Start the crit daemon to watch for file changes
 */
export async function startDaemon(
  projectPath: string,
  options: DaemonOptions = {}
): Promise<DaemonHandle> {
  const {
    onEvent,
    onActions,
    onCriticisms,
    writeHistory = true,
    writeReports = true,
    analyzeCriticisms = true,
  } = options;

  // Set up processing callback for debounced events
  setProcessingCallback(async (events: WatchEvent[]) => {
    // Process all events
    const results = await processBatch(events, projectPath);

    // Filter out "none" actions for reporting
    const significantActions = results
      .filter((r) => r.action !== "none")
      .map((r) => ({ action: r.action, details: r.details }));

    if (significantActions.length > 0) {
      // Notify callback
      if (onActions) {
        onActions(significantActions);
      }

      // Write to report file
      if (writeReports) {
        await reportActions(projectPath, significantActions);
      }

      // Log to history
      if (writeHistory) {
        for (const { action, details } of significantActions) {
          // Map daemon actions to history action types
          const historyAction = mapToHistoryAction(action);
          if (historyAction) {
            await appendHistory(projectPath, {
              action: historyAction,
              description: details,
              files: events.map((e) => e.path),
            });
          }
        }
      }
    }

    // Analyze for criticisms
    if (analyzeCriticisms) {
      try {
        const analysisResult = await analyzeChanges(projectPath, events);
        if (analysisResult.criticisms.length > 0 && onCriticisms) {
          onCriticisms(analysisResult.criticisms.length);
        }
      } catch {
        // Ignore analysis errors
      }
    }
  });

  // Create watcher (now async)
  const watcher = await createWatcher(projectPath, (event: WatchEvent) => {
    // Notify callback
    if (onEvent) {
      onEvent(event);
    }

    // Queue for processing (with debouncing)
    queueChange(event);
  });

  return {
    stop: () => {
      clearPendingChanges();
      watcher.stop();
    },
  };
}

function mapToHistoryAction(
  action: string
): "simplify" | "fix" | "update_docs" | "apply_rule" | "suggest" | null {
  switch (action) {
    case "update_context":
      return "update_docs";
    case "check_rules":
      return "apply_rule";
    case "suggest_test":
      return "suggest";
    default:
      return null;
  }
}

// Re-export types
export type { WatchEvent } from "./watcher";
export type { ProcessResult } from "./processor";
