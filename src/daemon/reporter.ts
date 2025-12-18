import { join } from "path";
import { mkdir } from "fs/promises";

const CRIT_DIR = ".crit";
const LAST_ACTION_FILE = "last_action.md";

/**
 * Report an action to the last_action.md file
 * This file is human-readable and shows what the daemon did
 */
export async function reportAction(
  projectPath: string,
  action: string,
  details: string
): Promise<void> {
  const critDir = join(projectPath, CRIT_DIR);
  const actionFile = join(critDir, LAST_ACTION_FILE);

  // Ensure .crit directory exists
  await mkdir(critDir, { recursive: true });

  const timestamp = new Date().toISOString();
  const content = `# Last Daemon Action

**Time:** ${timestamp}

**Action:** ${action}

## Details

${details}
`;

  await Bun.write(actionFile, content);
}

/**
 * Report multiple actions in a batch
 */
export async function reportActions(
  projectPath: string,
  actions: Array<{ action: string; details: string }>
): Promise<void> {
  if (actions.length === 0) return;

  const critDir = join(projectPath, CRIT_DIR);
  const actionFile = join(critDir, LAST_ACTION_FILE);

  // Ensure .crit directory exists
  await mkdir(critDir, { recursive: true });

  const timestamp = new Date().toISOString();

  // Group actions by type
  const grouped = new Map<string, string[]>();
  for (const { action, details } of actions) {
    if (!grouped.has(action)) {
      grouped.set(action, []);
    }
    grouped.get(action)!.push(details);
  }

  let content = `# Last Daemon Actions

**Time:** ${timestamp}

**Actions:** ${actions.length}

`;

  for (const [action, detailsList] of Array.from(grouped.entries())) {
    content += `## ${formatActionName(action)}

`;
    for (const details of detailsList) {
      content += `- ${details}\n`;
    }
    content += "\n";
  }

  await Bun.write(actionFile, content);
}

function formatActionName(action: string): string {
  switch (action) {
    case "update_context":
      return "Context Updates";
    case "check_rules":
      return "Rule Checks";
    case "suggest_test":
      return "Test Suggestions";
    case "none":
      return "Observed (No Action)";
    default:
      return action;
  }
}

/**
 * Read the last action file
 */
export async function getLastAction(projectPath: string): Promise<string | null> {
  const actionFile = join(projectPath, CRIT_DIR, LAST_ACTION_FILE);
  const file = Bun.file(actionFile);

  if (!(await file.exists())) {
    return null;
  }

  return file.text();
}
