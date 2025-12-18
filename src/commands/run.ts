import { getCritDir, critExists } from "../lib/paths";
import { startDaemon, type WatchEvent } from "../daemon";

export async function run() {
  const projectPath = process.cwd();

  if (!critExists()) {
    console.log("crit is not initialized. Run 'crit init' first.");
    return;
  }

  console.log(`Starting crit daemon in ${projectPath}...`);
  console.log("Watching for changes... (Ctrl+C to stop)\n");

  const daemon = await startDaemon(projectPath, {
    onEvent: (event: WatchEvent) => {
      const icon = getEventIcon(event.type);
      const time = formatTime(event.timestamp);
      console.log(`${icon} [${time}] ${event.type}: ${event.path}`);
    },
    onActions: (actions) => {
      console.log(`\n--- Processing ${actions.length} action(s) ---`);
      for (const { action, details } of actions) {
        console.log(`  ${getActionIcon(action)} ${details}`);
      }
      console.log("");
    },
  });

  // Handle graceful shutdown
  const shutdown = () => {
    console.log("\nStopping daemon...");
    daemon.stop();
    console.log("Daemon stopped.");
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive
  await new Promise(() => {});
}

function getEventIcon(type: "add" | "change" | "unlink"): string {
  switch (type) {
    case "add":
      return "+";
    case "change":
      return "~";
    case "unlink":
      return "-";
  }
}

function getActionIcon(action: string): string {
  switch (action) {
    case "update_context":
      return "[context]";
    case "check_rules":
      return "[rules]";
    case "suggest_test":
      return "[test]";
    default:
      return "[info]";
  }
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
