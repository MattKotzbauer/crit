import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rm, mkdir } from "fs/promises";

import { handlePreTool } from "./pre-tool";
import { handlePostTool } from "./post-tool";
import { installHooks, removeHooks, hooksInstalled } from "./install";
import type { PreToolInput, PostToolInput } from "./types";

const TEST_DIR = "/tmp/crit-hooks-test";
const CRIT_DIR = join(TEST_DIR, ".crit");
const STATE_DIR = join(CRIT_DIR, "state");
const CLAUDE_DIR = join(TEST_DIR, ".claude");

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(STATE_DIR, { recursive: true });
  await mkdir(CLAUDE_DIR, { recursive: true });

  // Create minimal config to indicate crit is initialized
  await Bun.write(join(CRIT_DIR, "config.json"), JSON.stringify({ version: "0.1.0" }));
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("PreToolUse Hook", () => {
  test("approves when crit not initialized", async () => {
    // Remove crit dir
    await rm(CRIT_DIR, { recursive: true, force: true });

    const input: PreToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/some/file.ts" },
    };

    const result = await handlePreTool(input, TEST_DIR);
    expect(result.decision).toBe("approve");
  });

  test("approves Write tool and reminds about tests", async () => {
    const input: PreToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/myfile.ts" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    expect(result.reason).toContain("should have corresponding tests");
  });

  test("approves Edit tool for source files with test reminder", async () => {
    const input: PreToolInput = {
      tool_name: "Edit",
      tool_input: { file_path: "/src/component.tsx" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    expect(result.reason).toContain("tests");
  });

  test("does not remind about tests for test files", async () => {
    const input: PreToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/myfile.test.ts" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    // Should not have test reminder for test files
    expect(result.reason || "").not.toContain("should have corresponding tests");
  });

  test("does not remind about tests for type files", async () => {
    const input: PreToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/types/index.ts" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    expect(result.reason || "").not.toContain("should have corresponding tests");
  });

  test("detects test commands in Bash", async () => {
    const input: PreToolInput = {
      tool_name: "Bash",
      tool_input: { command: "bun test src/lib" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    expect(result.reason).toContain("Test run detected");
  });

  test("detects npm test commands", async () => {
    const input: PreToolInput = {
      tool_name: "Bash",
      tool_input: { command: "npm test" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    expect(result.reason).toContain("Test run detected");
  });

  test("includes rules in context when present", async () => {
    // Create a rules file
    await Bun.write(
      join(CRIT_DIR, "rules.md"),
      `# Testing
- Always write tests for new code
- Use descriptive test names
`
    );

    const input: PreToolInput = {
      tool_name: "Read",
      tool_input: { file_path: "/some/file.ts" },
    };

    const result = await handlePreTool(input, TEST_DIR);

    expect(result.decision).toBe("approve");
    expect(result.reason).toContain("Active project rules");
    expect(result.reason).toContain("Always write tests");
  });
});

describe("PostToolUse Hook", () => {
  test("logs Write operations to history", async () => {
    const input: PostToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/newfile.ts" },
      tool_output: { success: true },
    };

    await handlePostTool(input, TEST_DIR);

    // Check history file
    const historyPath = join(STATE_DIR, "history.jsonl");
    const historyContent = await Bun.file(historyPath).text();
    const lines = historyContent.trim().split("\n");

    expect(lines.length).toBeGreaterThan(0);

    const entry = JSON.parse(lines[0]);
    expect(entry.description).toContain("Write");
    expect(entry.files).toContain("/src/newfile.ts");
  });

  test("logs Edit operations to history", async () => {
    const input: PostToolInput = {
      tool_name: "Edit",
      tool_input: { file_path: "/src/existing.ts" },
      tool_output: { success: true },
    };

    await handlePostTool(input, TEST_DIR);

    const historyPath = join(STATE_DIR, "history.jsonl");
    const historyContent = await Bun.file(historyPath).text();
    const entry = JSON.parse(historyContent.trim());

    expect(entry.description).toContain("Edit");
    expect(entry.files).toContain("/src/existing.ts");
  });

  test("updates session focus on file operations", async () => {
    const input: PostToolInput = {
      tool_name: "Read",
      tool_input: { file_path: "/src/focus.ts" },
      tool_output: "file contents",
    };

    await handlePostTool(input, TEST_DIR);

    const sessionPath = join(STATE_DIR, "session.json");
    const session = await Bun.file(sessionPath).json();

    expect(session.currentFocus).toBe("/src/focus.ts");
  });

  test("handles missing crit gracefully", async () => {
    await rm(CRIT_DIR, { recursive: true, force: true });

    const input: PostToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/file.ts" },
      tool_output: { success: true },
    };

    // Should not throw
    await handlePostTool(input, TEST_DIR);
  });

  test("queues initiative for untested source files", async () => {
    const input: PostToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/newfeature.ts" },
      tool_output: { success: true },
    };

    await handlePostTool(input, TEST_DIR);

    const initiativesPath = join(STATE_DIR, "initiatives.json");
    const initiatives = await Bun.file(initiativesPath).json();

    expect(initiatives.length).toBeGreaterThan(0);
    expect(initiatives[0].description).toContain("testing");
    expect(initiatives[0].files).toContain("/src/newfeature.ts");
  });

  test("does not queue initiative for test files", async () => {
    // Clear any existing initiatives
    await Bun.write(join(STATE_DIR, "initiatives.json"), "[]");

    const input: PostToolInput = {
      tool_name: "Write",
      tool_input: { file_path: "/src/feature.test.ts" },
      tool_output: { success: true },
    };

    await handlePostTool(input, TEST_DIR);

    const initiativesPath = join(STATE_DIR, "initiatives.json");
    const initiatives = await Bun.file(initiativesPath).json();

    // Should only have the original entry, no new initiative for test file
    const testingInitiatives = initiatives.filter((i: { description: string }) =>
      i.description.includes("testing")
    );
    expect(testingInitiatives.length).toBe(0);
  });
});

describe("Hook Installation", () => {
  test("hooksInstalled returns false when not installed", async () => {
    const result = await hooksInstalled(TEST_DIR);
    expect(result).toBe(false);
  });

  test("installHooks creates settings with hooks", async () => {
    await installHooks(TEST_DIR);

    const settingsPath = join(CLAUDE_DIR, "settings.json");
    const settings = await Bun.file(settingsPath).json();

    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();

    expect(settings.hooks.PreToolUse.length).toBeGreaterThan(0);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toContain("crit hook pre-tool");

    expect(settings.hooks.PostToolUse.length).toBeGreaterThan(0);
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toContain("crit hook post-tool");
  });

  test("hooksInstalled returns true after installation", async () => {
    await installHooks(TEST_DIR);
    const result = await hooksInstalled(TEST_DIR);
    expect(result).toBe(true);
  });

  test("installHooks preserves existing settings", async () => {
    // Create existing settings
    await Bun.write(
      join(CLAUDE_DIR, "settings.json"),
      JSON.stringify({
        model: "claude-sonnet-4-20250514",
        customSetting: true,
      })
    );

    await installHooks(TEST_DIR);

    const settings = await Bun.file(join(CLAUDE_DIR, "settings.json")).json();

    expect(settings.model).toBe("claude-sonnet-4-20250514");
    expect(settings.customSetting).toBe(true);
    expect(settings.hooks).toBeDefined();
  });

  test("installHooks preserves existing hooks", async () => {
    // Create existing settings with hooks
    await Bun.write(
      join(CLAUDE_DIR, "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Write",
              hooks: [{ type: "command", command: "other-tool pre" }],
            },
          ],
        },
      })
    );

    await installHooks(TEST_DIR);

    const settings = await Bun.file(join(CLAUDE_DIR, "settings.json")).json();

    // Should have both the existing hook and crit hooks
    expect(settings.hooks.PreToolUse.length).toBe(2);
  });

  test("removeHooks removes crit hooks", async () => {
    await installHooks(TEST_DIR);
    await removeHooks(TEST_DIR);

    const result = await hooksInstalled(TEST_DIR);
    expect(result).toBe(false);
  });

  test("removeHooks preserves other hooks", async () => {
    // Create settings with existing and crit hooks
    await Bun.write(
      join(CLAUDE_DIR, "settings.json"),
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Write",
              hooks: [{ type: "command", command: "other-tool pre" }],
            },
          ],
        },
      })
    );

    await installHooks(TEST_DIR);
    await removeHooks(TEST_DIR);

    const settings = await Bun.file(join(CLAUDE_DIR, "settings.json")).json();

    // Should still have the other hook
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("other-tool pre");
  });

  test("removeHooks does nothing when not installed", async () => {
    // Should not throw
    await removeHooks(TEST_DIR);

    const result = await hooksInstalled(TEST_DIR);
    expect(result).toBe(false);
  });

  test("installHooks is idempotent", async () => {
    await installHooks(TEST_DIR);
    await installHooks(TEST_DIR);
    await installHooks(TEST_DIR);

    const settings = await Bun.file(join(CLAUDE_DIR, "settings.json")).json();

    // Should only have one set of crit hooks, not three
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PostToolUse.length).toBe(1);
  });
});
