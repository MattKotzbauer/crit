/**
 * Hook command for crit CLI
 *
 * Handles:
 * - crit hook pre-tool   # Handle pre-tool hook (reads stdin)
 * - crit hook post-tool  # Handle post-tool hook (reads stdin)
 * - crit hook install    # Install hooks to project
 * - crit hook remove     # Remove hooks from project
 * - crit hook status     # Check if hooks are installed
 */

import { handleHook, installHooks, removeHooks, hooksInstalled } from "../hooks";

export async function hookPreTool(): Promise<void> {
  await handleHook("pre-tool");
}

export async function hookPostTool(): Promise<void> {
  await handleHook("post-tool");
}

export async function hookInstall(): Promise<void> {
  const projectPath = process.cwd();

  try {
    const alreadyInstalled = await hooksInstalled(projectPath);

    if (alreadyInstalled) {
      console.log("crit hooks are already installed.");
      return;
    }

    await installHooks(projectPath);
    console.log("crit hooks installed successfully.");
    console.log("Hooks added to .claude/settings.json");
  } catch (error) {
    console.error("Failed to install hooks:", error);
    process.exit(1);
  }
}

export async function hookRemove(): Promise<void> {
  const projectPath = process.cwd();

  try {
    const isInstalled = await hooksInstalled(projectPath);

    if (!isInstalled) {
      console.log("crit hooks are not installed.");
      return;
    }

    await removeHooks(projectPath);
    console.log("crit hooks removed successfully.");
  } catch (error) {
    console.error("Failed to remove hooks:", error);
    process.exit(1);
  }
}

export async function hookStatus(): Promise<void> {
  const projectPath = process.cwd();

  try {
    const isInstalled = await hooksInstalled(projectPath);

    if (isInstalled) {
      console.log("crit hooks: installed");
    } else {
      console.log("crit hooks: not installed");
      console.log("Run 'crit hook install' to install hooks.");
    }
  } catch (error) {
    console.error("Failed to check hook status:", error);
    process.exit(1);
  }
}
