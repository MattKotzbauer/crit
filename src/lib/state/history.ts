import { join } from "path";
import type { HistoryEntry } from "./types";

const STATE_DIR = ".crit/state";
const HISTORY_FILE = "history.jsonl";

function getHistoryPath(projectPath: string): string {
  return join(projectPath, STATE_DIR, HISTORY_FILE);
}

export async function appendHistory(
  projectPath: string,
  entry: Omit<HistoryEntry, "timestamp">
): Promise<void> {
  const historyPath = getHistoryPath(projectPath);
  const file = Bun.file(historyPath);

  const fullEntry: HistoryEntry = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(fullEntry) + "\n";

  if (await file.exists()) {
    // Append to existing file
    const existing = await file.text();
    await Bun.write(historyPath, existing + line);
  } else {
    // Create new file
    await Bun.write(historyPath, line);
  }
}

export async function getHistory(
  projectPath: string,
  limit?: number
): Promise<HistoryEntry[]> {
  const historyPath = getHistoryPath(projectPath);
  const file = Bun.file(historyPath);

  if (!(await file.exists())) {
    return [];
  }

  try {
    const content = await file.text();
    const lines = content.trim().split("\n").filter(Boolean);
    const entries = lines.map((line) => JSON.parse(line) as HistoryEntry);

    if (limit !== undefined) {
      return entries.slice(-limit);
    }

    return entries;
  } catch {
    return [];
  }
}

export async function getRecentHistory(
  projectPath: string,
  count: number
): Promise<HistoryEntry[]> {
  return getHistory(projectPath, count);
}
