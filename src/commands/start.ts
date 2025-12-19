/**
 * crit start - Idempotent setup and run
 *
 * Does everything needed to get crit running:
 * 1. Init if not already initialized
 * 2. Install hooks if not installed
 * 3. Start daemon
 */

import { existsSync } from "fs";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { installHooks, hooksInstalled } from "../hooks/install";
import { startDaemon } from "../daemon";

const PID_FILE = ".crit/daemon.pid";

const DEFAULT_PROJECT_MD = `# Project

## Goals
<!-- What are you building? List features/deliverables here -->
-

## Rules
<!-- How should the AI build it? Add constraints here -->
- Keep it simple
- Test before marking done
`;

export async function start() {
  const cwd = process.cwd();
  const critDir = join(cwd, ".crit");
  const projectFile = join(critDir, "project.md");

  // Step 1: Init if needed
  if (!existsSync(critDir)) {
    console.log("Initializing crit...");
    await mkdir(join(critDir, "state"), { recursive: true });
    await mkdir(join(critDir, "context"), { recursive: true });
    await writeFile(projectFile, DEFAULT_PROJECT_MD);
    await writeFile(join(critDir, "config.json"), JSON.stringify({ version: "0.1.0" }, null, 2));
    console.log("Created .crit/project.md - edit this to define your goals and rules");
  } else if (!existsSync(projectFile)) {
    // Migrate: create project.md if missing
    await writeFile(projectFile, DEFAULT_PROJECT_MD);
    console.log("Created .crit/project.md");
  } else {
    console.log("crit already initialized");
  }

  // Step 2: Install hooks if needed
  const hooksAlreadyInstalled = await hooksInstalled(cwd);
  if (!hooksAlreadyInstalled) {
    console.log("Installing Claude Code hooks...");
    try {
      await installHooks(cwd);
      console.log("Hooks installed");
    } catch (error) {
      console.log("Could not install hooks:", error);
      console.log("(You can install manually with: crit hook install)");
    }
  } else {
    console.log("Hooks already installed");
  }

  // Step 3: Start daemon
  console.log("Starting daemon...");
  const daemon = await startDaemon(cwd, {
    onEvent: (event) => {
      console.log(`[${event.type}] ${event.path}`);
    },
    onActions: (actions) => {
      for (const action of actions) {
        console.log(`→ ${action.action}: ${action.details}`);
      }
    },
  });

  // Write pid file
  const pidPath = join(cwd, PID_FILE);
  await writeFile(pidPath, process.pid.toString());

  console.log("\ncrit is running. Press Ctrl+C to stop.\n");
  console.log("Edit .crit/project.md to define goals and rules.");

  const cleanup = async () => {
    daemon.stop();
    await rm(pidPath, { force: true });
  };

  // Handle graceful shutdown
  process.on("SIGINT", async () => {
    console.log("\nStopping...");
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await cleanup();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}
