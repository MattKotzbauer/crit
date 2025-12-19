#!/usr/bin/env bun

import { Command } from "commander";
import { start } from "./commands/start";
import { stop } from "./commands/stop";
import { status } from "./commands/status";
import { clean } from "./commands/clean";
import { history } from "./commands/history";
import { test } from "./commands/test";
import {
  hookPreTool,
  hookPostTool,
  hookInstall,
  hookRemove,
  hookStatus,
} from "./commands/hook";
import { tui } from "./tui";

// If no args, launch TUI
if (process.argv.length === 2) {
  tui().catch(console.error);
} else {
  const program = new Command();

  program
    .name("crit")
    .description(
      `Circular AI development tool

Quick Start:
  crit                Launch interactive TUI
  crit start          Initialize and run crit
  crit stop           Stop the daemon

Edit .crit/project.md to define your goals and rules.`
    )
    .version("0.1.0");

  // Primary commands
  program
    .command("start")
    .description("Initialize (if needed) and run crit")
    .action(start);

  program
    .command("stop")
    .description("Stop the crit daemon")
    .action(stop);

  // Inspection commands
  program
    .command("status")
    .description("Show project status and goals")
    .action(status);

  program
    .command("history")
    .description("View action history")
    .action(history);

  program
    .command("test")
    .description("Show test coverage status")
    .option("--verify", "Run tests and verify they pass")
    .action(test);

  // Utility commands
  program
    .command("clean")
    .description("Clean up temporary files and state")
    .action(clean);

  // Hook subcommands (for advanced use / debugging)
  const hookCmd = program
    .command("hook")
    .description("Claude Code hook management");

  hookCmd
    .command("install")
    .description("Install crit hooks to Claude Code")
    .action(hookInstall);

  hookCmd
    .command("remove")
    .description("Remove crit hooks from Claude Code")
    .action(hookRemove);

  hookCmd
    .command("status")
    .description("Check if hooks are installed")
    .action(hookStatus);

  hookCmd
    .command("pre-tool")
    .description("Handle pre-tool hook (internal)")
    .action(hookPreTool);

  hookCmd
    .command("post-tool")
    .description("Handle post-tool hook (internal)")
    .action(hookPostTool);

  program.parse();
}
