import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rm, mkdir } from "fs/promises";

import {
  loadSession,
  saveSession,
  updateSession,
  appendHistory,
  getHistory,
  getRecentHistory,
  loadInitiatives,
  saveInitiatives,
  addInitiative,
  updateInitiative,
  getNextInitiative,
} from "./index";
import type { SessionState, Initiative } from "./types";

const TEST_DIR = "/tmp/crit-state-test";
const STATE_DIR = join(TEST_DIR, ".crit/state");

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(STATE_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("Session", () => {
  test("loadSession returns defaults when no file exists", async () => {
    const session = await loadSession(TEST_DIR);

    expect(session.currentFocus).toBeNull();
    expect(session.stats.simplifications).toBe(0);
    expect(session.stats.rulesApplied).toBe(0);
    expect(session.stats.docsUpdated).toBe(0);
    expect(session.lastActive).toBeDefined();
  });

  test("saveSession and loadSession roundtrip", async () => {
    const state: SessionState = {
      lastActive: "2024-01-01T00:00:00.000Z",
      currentFocus: "src/main.ts",
      stats: {
        simplifications: 5,
        rulesApplied: 10,
        docsUpdated: 2,
      },
    };

    await saveSession(TEST_DIR, state);
    const loaded = await loadSession(TEST_DIR);

    expect(loaded).toEqual(state);
  });

  test("updateSession merges updates", async () => {
    const initial: SessionState = {
      lastActive: "2024-01-01T00:00:00.000Z",
      currentFocus: "src/main.ts",
      stats: {
        simplifications: 5,
        rulesApplied: 10,
        docsUpdated: 2,
      },
    };

    await saveSession(TEST_DIR, initial);
    await updateSession(TEST_DIR, {
      currentFocus: "src/other.ts",
      stats: { simplifications: 6, rulesApplied: 10, docsUpdated: 2 },
    });

    const loaded = await loadSession(TEST_DIR);

    expect(loaded.currentFocus).toBe("src/other.ts");
    expect(loaded.stats.simplifications).toBe(6);
    // lastActive should be updated
    expect(loaded.lastActive).not.toBe(initial.lastActive);
  });
});

describe("History", () => {
  test("getHistory returns empty array when no file exists", async () => {
    const history = await getHistory(TEST_DIR);
    expect(history).toEqual([]);
  });

  test("appendHistory adds entries", async () => {
    await appendHistory(TEST_DIR, {
      action: "simplify",
      description: "Simplified foo function",
      files: ["src/foo.ts"],
    });

    await appendHistory(TEST_DIR, {
      action: "fix",
      description: "Fixed bar bug",
      files: ["src/bar.ts", "src/baz.ts"],
    });

    const history = await getHistory(TEST_DIR);

    expect(history.length).toBe(2);
    expect(history[0].action).toBe("simplify");
    expect(history[0].description).toBe("Simplified foo function");
    expect(history[0].files).toEqual(["src/foo.ts"]);
    expect(history[0].timestamp).toBeDefined();

    expect(history[1].action).toBe("fix");
    expect(history[1].files).toEqual(["src/bar.ts", "src/baz.ts"]);
  });

  test("getRecentHistory returns limited entries", async () => {
    for (let i = 0; i < 5; i++) {
      await appendHistory(TEST_DIR, {
        action: "simplify",
        description: `Entry ${i}`,
        files: [],
      });
    }

    const recent = await getRecentHistory(TEST_DIR, 2);

    expect(recent.length).toBe(2);
    expect(recent[0].description).toBe("Entry 3");
    expect(recent[1].description).toBe("Entry 4");
  });

  test("history is stored in JSONL format", async () => {
    await appendHistory(TEST_DIR, {
      action: "simplify",
      description: "First",
      files: [],
    });

    await appendHistory(TEST_DIR, {
      action: "fix",
      description: "Second",
      files: [],
    });

    const content = await Bun.file(join(STATE_DIR, "history.jsonl")).text();
    const lines = content.trim().split("\n");

    expect(lines.length).toBe(2);
    // Each line should be valid JSON
    expect(() => JSON.parse(lines[0])).not.toThrow();
    expect(() => JSON.parse(lines[1])).not.toThrow();
  });
});

describe("Initiatives", () => {
  test("loadInitiatives returns empty array when no file exists", async () => {
    const initiatives = await loadInitiatives(TEST_DIR);
    expect(initiatives).toEqual([]);
  });

  test("addInitiative creates initiative with ID and timestamp", async () => {
    const id = await addInitiative(TEST_DIR, {
      priority: "high",
      type: "simplify",
      description: "Simplify complex function",
      files: ["src/complex.ts"],
    });

    expect(id).toBeDefined();
    expect(typeof id).toBe("string");

    const initiatives = await loadInitiatives(TEST_DIR);

    expect(initiatives.length).toBe(1);
    expect(initiatives[0].id).toBe(id);
    expect(initiatives[0].status).toBe("pending");
    expect(initiatives[0].priority).toBe("high");
    expect(initiatives[0].createdAt).toBeDefined();
  });

  test("updateInitiative modifies initiative", async () => {
    const id = await addInitiative(TEST_DIR, {
      priority: "medium",
      type: "fix",
      description: "Fix bug",
      files: ["src/bug.ts"],
    });

    await updateInitiative(TEST_DIR, id, {
      status: "completed",
    });

    const initiatives = await loadInitiatives(TEST_DIR);

    expect(initiatives[0].status).toBe("completed");
    expect(initiatives[0].priority).toBe("medium"); // unchanged
  });

  test("updateInitiative throws for non-existent ID", async () => {
    await expect(
      updateInitiative(TEST_DIR, "non-existent-id", { status: "completed" })
    ).rejects.toThrow("Initiative not found");
  });

  test("getNextInitiative returns highest priority pending", async () => {
    await addInitiative(TEST_DIR, {
      priority: "low",
      type: "cleanup",
      description: "Low priority task",
      files: [],
    });

    await addInitiative(TEST_DIR, {
      priority: "high",
      type: "fix",
      description: "High priority task",
      files: [],
    });

    await addInitiative(TEST_DIR, {
      priority: "medium",
      type: "simplify",
      description: "Medium priority task",
      files: [],
    });

    const next = await getNextInitiative(TEST_DIR);

    expect(next).not.toBeNull();
    expect(next!.priority).toBe("high");
    expect(next!.description).toBe("High priority task");
  });

  test("getNextInitiative returns null when all completed", async () => {
    const id = await addInitiative(TEST_DIR, {
      priority: "high",
      type: "fix",
      description: "Only task",
      files: [],
    });

    await updateInitiative(TEST_DIR, id, { status: "completed" });

    const next = await getNextInitiative(TEST_DIR);
    expect(next).toBeNull();
  });

  test("getNextInitiative returns oldest when same priority", async () => {
    // Add with slight delay to ensure different timestamps
    await addInitiative(TEST_DIR, {
      priority: "high",
      type: "fix",
      description: "First high",
      files: [],
    });

    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 10));

    await addInitiative(TEST_DIR, {
      priority: "high",
      type: "simplify",
      description: "Second high",
      files: [],
    });

    const next = await getNextInitiative(TEST_DIR);

    expect(next!.description).toBe("First high");
  });

  test("saveInitiatives and loadInitiatives roundtrip", async () => {
    const initiatives: Initiative[] = [
      {
        id: "test-1",
        priority: "high",
        type: "fix",
        description: "Test 1",
        files: ["a.ts"],
        status: "pending",
        createdAt: "2024-01-01T00:00:00.000Z",
      },
      {
        id: "test-2",
        priority: "low",
        type: "cleanup",
        description: "Test 2",
        files: [],
        status: "completed",
        createdAt: "2024-01-02T00:00:00.000Z",
      },
    ];

    await saveInitiatives(TEST_DIR, initiatives);
    const loaded = await loadInitiatives(TEST_DIR);

    expect(loaded).toEqual(initiatives);
  });
});
