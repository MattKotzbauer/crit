/**
 * crit deliverables - Track what features work
 *
 * Usage:
 *   crit deliverables           # List all deliverables
 *   crit deliverables add       # Add new deliverable (interactive)
 *   crit deliverables working   # List working features
 *   crit deliverables broken    # List broken features
 */

import { getCritDir, critExists } from "../lib/paths";
import {
  loadDeliverables,
  getSummary,
  formatForDisplay,
  getByStatus,
} from "../lib/deliverables";

export async function deliverables(subcommand?: string) {
  if (!critExists()) {
    console.log("crit is not initialized. Run 'crit init' first.");
    return;
  }

  const projectPath = process.cwd();

  switch (subcommand) {
    case "summary":
    case undefined: {
      const summary = await getSummary(projectPath);

      console.log("Deliverables Summary");
      console.log("────────────────────");
      console.log(`Total:    ${summary.total}`);
      console.log(`Working:  ${summary.working} ✓`);
      console.log(`Partial:  ${summary.partial} ◐`);
      console.log(`Broken:   ${summary.broken} ✗`);
      console.log(`Untested: ${summary.untested} ?`);
      console.log(`Planned:  ${summary.planned} ○`);

      if (summary.total === 0) {
        console.log("\nNo deliverables tracked yet.");
        console.log("Use the MCP tool crit_add_deliverable to add features.");
      }
      break;
    }

    case "list": {
      const state = await loadDeliverables(projectPath);
      if (state.deliverables.length === 0) {
        console.log("No deliverables tracked yet.");
        return;
      }
      console.log(formatForDisplay(state));
      break;
    }

    case "working": {
      const working = await getByStatus(projectPath, "working");
      if (working.length === 0) {
        console.log("No verified working features yet.");
        return;
      }
      console.log("Working Features");
      console.log("────────────────");
      for (const d of working) {
        console.log(`✓ ${d.name}`);
        console.log(`  ${d.description}`);
        if (d.lastVerified) {
          console.log(`  Last verified: ${new Date(d.lastVerified).toLocaleDateString()}`);
        }
      }
      break;
    }

    case "broken": {
      const broken = await getByStatus(projectPath, "broken");
      if (broken.length === 0) {
        console.log("No broken features. Nice!");
        return;
      }
      console.log("Broken Features");
      console.log("───────────────");
      for (const d of broken) {
        console.log(`✗ ${d.name}`);
        console.log(`  ${d.description}`);
        if (d.changelog && d.changelog.length > 0) {
          const last = d.changelog[d.changelog.length - 1];
          console.log(`  ${last.change}`);
        }
      }
      break;
    }

    case "untested": {
      const untested = await getByStatus(projectPath, "untested");
      if (untested.length === 0) {
        console.log("All features are tested. Nice!");
        return;
      }
      console.log("Untested Features");
      console.log("─────────────────");
      for (const d of untested) {
        console.log(`? ${d.name}`);
        console.log(`  ${d.description}`);
        if (d.files.length > 0) {
          console.log(`  Files: ${d.files.join(", ")}`);
        }
      }
      break;
    }

    default:
      console.log("Unknown subcommand:", subcommand);
      console.log("Usage: crit deliverables [summary|list|working|broken|untested]");
  }
}
