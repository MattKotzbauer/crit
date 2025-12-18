/**
 * Hook installation utilities
 *
 * Manages installation of crit hooks into .claude/settings.json
 */

import { join } from "path";
import { mkdir } from "fs/promises";

const CLAUDE_DIR = ".claude";
const SETTINGS_FILE = "settings.json";

interface HookConfig {
  type: "command";
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookConfig[];
}

interface ClaudeSettings {
  hooks?: {
    PreToolUse?: HookMatcher[];
    PostToolUse?: HookMatcher[];
    [key: string]: HookMatcher[] | undefined;
  };
  [key: string]: unknown;
}

const CRIT_HOOK_MARKER = "crit hook";

/**
 * Get the path to .claude/settings.json
 */
function getSettingsPath(projectPath: string): string {
  return join(projectPath, CLAUDE_DIR, SETTINGS_FILE);
}

/**
 * Load existing Claude settings or return empty object
 */
async function loadSettings(projectPath: string): Promise<ClaudeSettings> {
  const settingsPath = getSettingsPath(projectPath);
  const file = Bun.file(settingsPath);

  if (!(await file.exists())) {
    return {};
  }

  try {
    return await file.json();
  } catch {
    return {};
  }
}

/**
 * Save Claude settings
 */
async function saveSettings(
  projectPath: string,
  settings: ClaudeSettings
): Promise<void> {
  const claudeDir = join(projectPath, CLAUDE_DIR);
  const settingsPath = getSettingsPath(projectPath);

  // Ensure .claude directory exists
  await mkdir(claudeDir, { recursive: true });

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

/**
 * Check if crit hooks are installed
 */
export async function hooksInstalled(projectPath: string): Promise<boolean> {
  const settings = await loadSettings(projectPath);

  if (!settings.hooks) {
    return false;
  }

  const hasPreTool = settings.hooks.PreToolUse?.some((matcher) =>
    matcher.hooks.some((hook) => hook.command.includes(CRIT_HOOK_MARKER))
  );

  const hasPostTool = settings.hooks.PostToolUse?.some((matcher) =>
    matcher.hooks.some((hook) => hook.command.includes(CRIT_HOOK_MARKER))
  );

  return hasPreTool === true && hasPostTool === true;
}

/**
 * Install crit hooks into .claude/settings.json
 */
export async function installHooks(projectPath: string): Promise<void> {
  const settings = await loadSettings(projectPath);

  // Initialize hooks object if not present
  if (!settings.hooks) {
    settings.hooks = {};
  }

  // Create crit hook configs
  const preToolHook: HookMatcher = {
    matcher: "*",
    hooks: [
      {
        type: "command",
        command: "crit hook pre-tool",
      },
    ],
  };

  const postToolHook: HookMatcher = {
    matcher: "*",
    hooks: [
      {
        type: "command",
        command: "crit hook post-tool",
      },
    ],
  };

  // Remove any existing crit hooks first
  if (settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
      (matcher) =>
        !matcher.hooks.some((hook) => hook.command.includes(CRIT_HOOK_MARKER))
    );
  }

  if (settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (matcher) =>
        !matcher.hooks.some((hook) => hook.command.includes(CRIT_HOOK_MARKER))
    );
  }

  // Add crit hooks
  if (!settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = [];
  }
  settings.hooks.PreToolUse.push(preToolHook);

  if (!settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = [];
  }
  settings.hooks.PostToolUse.push(postToolHook);

  await saveSettings(projectPath, settings);
}

/**
 * Remove crit hooks from .claude/settings.json
 */
export async function removeHooks(projectPath: string): Promise<void> {
  const settings = await loadSettings(projectPath);

  if (!settings.hooks) {
    return;
  }

  // Remove crit hooks from PreToolUse
  if (settings.hooks.PreToolUse) {
    settings.hooks.PreToolUse = settings.hooks.PreToolUse.filter(
      (matcher) =>
        !matcher.hooks.some((hook) => hook.command.includes(CRIT_HOOK_MARKER))
    );

    // Clean up empty array
    if (settings.hooks.PreToolUse.length === 0) {
      delete settings.hooks.PreToolUse;
    }
  }

  // Remove crit hooks from PostToolUse
  if (settings.hooks.PostToolUse) {
    settings.hooks.PostToolUse = settings.hooks.PostToolUse.filter(
      (matcher) =>
        !matcher.hooks.some((hook) => hook.command.includes(CRIT_HOOK_MARKER))
    );

    // Clean up empty array
    if (settings.hooks.PostToolUse.length === 0) {
      delete settings.hooks.PostToolUse;
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await saveSettings(projectPath, settings);
}
