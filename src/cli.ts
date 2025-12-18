#!/usr/bin/env bun

import { Command } from "commander";
import { init } from "./commands/init";
import { status } from "./commands/status";
import { rules } from "./commands/rules";
import { context } from "./commands/context";
import { run } from "./commands/run";
import { suggest } from "./commands/suggest";
import { clean } from "./commands/clean";
import { history } from "./commands/history";
import { test } from "./commands/test";
import { deliverables } from "./commands/deliverables";
import {
  hookPreTool,
  hookPostTool,
  hookInstall,
  hookRemove,
  hookStatus,
} from "./commands/hook";

const program = new Command();

program
  .name("crit")
  .description("Circular AI development tool")
  .version("0.1.0");

program
  .command("init")
  .description("Initialize crit in the current directory")
  .action(init);

program
  .command("status")
  .description("Show crit status")
  .action(status);

program
  .command("rules")
  .description("View rules")
  .action(rules);

program
  .command("context")
  .description("View context files")
  .action(context);

program
  .command("run")
  .description("Start the crit daemon")
  .action(run);

program
  .command("suggest")
  .description("Get AI-powered suggestions")
  .action(suggest);

program
  .command("clean")
  .description("Clean up temporary files and state")
  .action(clean);

program
  .command("history")
  .description("View action history")
  .action(history);

program
  .command("test")
  .description("Show test coverage status")
  .option("--verify", "Run tests and verify they pass")
  .action(test);

program
  .command("deliverables [subcommand]")
  .description("Track what features work (summary|list|working|broken|untested)")
  .action(deliverables);

// Hook subcommands
const hookCmd = program
  .command("hook")
  .description("Claude Code hook integration");

hookCmd
  .command("pre-tool")
  .description("Handle pre-tool hook (reads JSON from stdin)")
  .action(hookPreTool);

hookCmd
  .command("post-tool")
  .description("Handle post-tool hook (reads JSON from stdin)")
  .action(hookPostTool);

hookCmd
  .command("install")
  .description("Install crit hooks to .claude/settings.json")
  .action(hookInstall);

hookCmd
  .command("remove")
  .description("Remove crit hooks from .claude/settings.json")
  .action(hookRemove);

hookCmd
  .command("status")
  .description("Check if crit hooks are installed")
  .action(hookStatus);

program.parse();
