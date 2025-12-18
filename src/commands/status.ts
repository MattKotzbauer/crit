import { getCritDir, getCritPath, paths, critExists } from "../lib/paths";
import { loadConfig } from "../lib/config";

export async function status() {
  const critDir = getCritDir();

  if (!critExists()) {
    console.log("crit is not initialized. Run 'crit init' first.");
    return;
  }

  const config = await loadConfig();

  console.log("crit status");
  console.log("───────────");
  console.log(`Directory: ${critDir}`);
  console.log(`Version: ${config?.version ?? "unknown"}`);

  // Check for rules
  const rulesFile = Bun.file(getCritPath(paths.rules));
  if (await rulesFile.exists()) {
    const rulesContent = await rulesFile.text();
    const lineCount = rulesContent.split("\n").length;
    console.log(`Rules: ${lineCount} lines`);
  }

  // Check for context files
  const contextDir = getCritPath(paths.context);
  console.log(`Context: ${contextDir}`);

  // Check session state
  const sessionFile = Bun.file(getCritPath(paths.stateSession));
  if (await sessionFile.exists()) {
    const session = await sessionFile.json();
    const keys = Object.keys(session);
    console.log(`Session: ${keys.length === 0 ? "empty" : `${keys.length} keys`}`);
  }

  console.log("\nStatus: Ready");
}
