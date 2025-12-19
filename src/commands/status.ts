import { existsSync } from "fs";
import { join } from "path";
import { loadProject, getGoalsSummary } from "../lib/project";

export async function status() {
  const cwd = process.cwd();
  const critDir = join(cwd, ".crit");
  const projectFile = join(critDir, "project.md");
  const pidFile = join(critDir, "daemon.pid");

  if (!existsSync(critDir)) {
    console.log("crit is not initialized. Run 'crit start' first.");
    return;
  }

  console.log("crit status");
  console.log("───────────");

  // Daemon status
  const daemonRunning = existsSync(pidFile);
  console.log(`Daemon: ${daemonRunning ? "running" : "stopped"}`);

  // Project status
  if (!existsSync(projectFile)) {
    console.log("\nNo project.md found. Run 'crit start' to create one.");
    return;
  }

  const project = await loadProject(cwd);
  const summary = await getGoalsSummary(cwd);

  console.log(`\nGoals: ${summary.total}`);
  if (summary.total > 0) {
    console.log(`  ✓ Done:    ${summary.done}`);
    console.log(`  → Working: ${summary.working}`);
    console.log(`  ○ Planned: ${summary.planned}`);
    if (summary.broken > 0) {
      console.log(`  ✗ Broken:  ${summary.broken}`);
    }
  }

  console.log(`\nRules: ${project.rules.length}`);
  for (const rule of project.rules.slice(0, 3)) {
    console.log(`  - ${rule.text}`);
  }
  if (project.rules.length > 3) {
    console.log(`  ... and ${project.rules.length - 3} more`);
  }

  console.log("\nEdit .crit/project.md to update goals and rules.");
}
