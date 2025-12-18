import { mkdir } from "fs/promises";
import { getCritDir, getCritPath, paths, critExists } from "../lib/paths";
import { generateOverview, formatOverviewMarkdown } from "../lib/overview";

const RULES_TEMPLATE = `# Crit Rules

Define rules for the AI assistant here.

## Example Rules

- Always write tests for new code
- Follow existing code style
- Document public APIs
`;

const ARCHITECTURE_TEMPLATE = `# Architecture

Document your project architecture here.

## Overview

[Describe the high-level structure of your project]

## Key Components

[List and describe main components]
`;

export async function init() {
  const critDir = getCritDir();

  // Check if already initialized
  if (critExists()) {
    console.log("crit is already initialized in this directory.");
    return;
  }

  console.log("Initializing crit...");

  // Create directory structure
  await mkdir(getCritPath(paths.context), { recursive: true });
  await mkdir(getCritPath(paths.state), { recursive: true });

  // Create files
  await Bun.write(getCritPath(paths.rules), RULES_TEMPLATE);
  await Bun.write(getCritPath(paths.contextArchitecture), ARCHITECTURE_TEMPLATE);
  await Bun.write(getCritPath(paths.stateSession), "{}");
  await Bun.write(getCritPath(paths.stateHistory), "");
  await Bun.write(getCritPath(paths.config), JSON.stringify({ version: "1.0" }, null, 2));

  // Generate project overview
  console.log("Scanning project structure...");
  const projectPath = process.cwd();
  try {
    const overview = await generateOverview(projectPath);
    const overviewMd = formatOverviewMarkdown(overview, projectPath);
    await Bun.write(getCritPath(paths.contextOverview), overviewMd);
    console.log(`Found ${overview.modules.length} modules`);
  } catch (error) {
    console.log("Could not generate overview (this is optional)");
  }

  console.log("\nCreated .crit/ directory structure:");
  console.log("  .crit/");
  console.log("  ├── rules.md");
  console.log("  ├── context/");
  console.log("  │   ├── architecture.md");
  console.log("  │   └── overview.md");
  console.log("  ├── state/");
  console.log("  │   ├── session.json");
  console.log("  │   └── history.jsonl");
  console.log("  └── config.json");
  console.log("\ncrit initialized successfully!");
}
