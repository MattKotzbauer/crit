import { getCritDir, getCritPath, paths, critExists } from "../lib/paths";

export async function history() {
  const critDir = getCritDir();

  if (!critExists()) {
    console.log("crit is not initialized. Run 'crit init' first.");
    return;
  }

  const historyFile = Bun.file(getCritPath(paths.stateHistory));

  if (!(await historyFile.exists())) {
    console.log("No history found.");
    return;
  }

  const content = await historyFile.text();

  if (content.trim() === "") {
    console.log("History is empty.");
    return;
  }

  console.log("History:");
  console.log("────────");

  const lines = content.trim().split("\n");
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      console.log(`  ${entry.timestamp ?? "unknown"}: ${entry.action ?? entry.type ?? "unknown action"}`);
    } catch {
      // Skip malformed lines
    }
  }
}
