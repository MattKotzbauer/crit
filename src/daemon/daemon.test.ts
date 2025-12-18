import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { tmpdir } from "os";
import { mkdir, rm, writeFile, appendFile } from "fs/promises";
import { startDaemon, type WatchEvent } from "./index";

describe("daemon", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create unique test directory for each test
    testDir = join(tmpdir(), `crit-daemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(join(testDir, ".crit", "state"), { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  test("should detect file creation", async () => {
    const events: WatchEvent[] = [];

    const daemon = await startDaemon(testDir, {
      onEvent: (event) => events.push(event),
      writeHistory: false,
      writeReports: false,
    });

    // Create a new file
    const testFile = join(testDir, "test.ts");
    await writeFile(testFile, 'console.log("hello");');

    // Wait for event to be detected
    await new Promise((resolve) => setTimeout(resolve, 500));

    daemon.stop();

    // Verify event was captured
    expect(events.length).toBeGreaterThan(0);
    const addEvent = events.find((e) => e.type === "add" && e.path === "test.ts");
    expect(addEvent).toBeDefined();
    expect(addEvent?.path).toBe("test.ts");
  });

  test("should detect file modification", async () => {
    // Create file before starting daemon
    const testFile = join(testDir, "existing.ts");
    await writeFile(testFile, 'const x = 1;');

    // Wait to ensure file is fully written
    await new Promise((resolve) => setTimeout(resolve, 200));

    const events: WatchEvent[] = [];

    const daemon = await startDaemon(testDir, {
      onEvent: (event) => events.push(event),
      writeHistory: false,
      writeReports: false,
    });

    // Modify the file by appending (ensures different content)
    await appendFile(testFile, '\nconst y = 2;');

    // Wait for event
    await new Promise((resolve) => setTimeout(resolve, 500));

    daemon.stop();

    // Verify change event was captured
    expect(events.length).toBeGreaterThan(0);
    const changeEvent = events.find(
      (e) => e.type === "change" && e.path === "existing.ts"
    );
    expect(changeEvent).toBeDefined();
  });

  test("should ignore node_modules", async () => {
    const events: WatchEvent[] = [];

    const daemon = await startDaemon(testDir, {
      onEvent: (event) => events.push(event),
      writeHistory: false,
      writeReports: false,
    });

    // Create node_modules directory and file
    await mkdir(join(testDir, "node_modules"), { recursive: true });
    await writeFile(
      join(testDir, "node_modules", "test.ts"),
      'console.log("ignored");'
    );

    // Wait for potential event
    await new Promise((resolve) => setTimeout(resolve, 500));

    daemon.stop();

    // Should not have any events for node_modules files
    const nodeModulesEvent = events.find((e) =>
      e.path.includes("node_modules")
    );
    expect(nodeModulesEvent).toBeUndefined();
  });

  test("should process actions for new source files", async () => {
    const actions: Array<{ action: string; details: string }> = [];

    const daemon = await startDaemon(testDir, {
      onActions: (a) => actions.push(...a),
      writeHistory: false,
      writeReports: false,
    });

    // Create a new TypeScript file
    await writeFile(join(testDir, "component.ts"), 'export function foo() {}');

    // Wait for processing (debounce 100ms + fs.watch delay + processing time)
    await new Promise((resolve) => setTimeout(resolve, 700));

    daemon.stop();

    // Should have suggest_test action for new source file
    expect(actions.length).toBeGreaterThan(0);
    const suggestAction = actions.find((a) => a.action === "suggest_test");
    expect(suggestAction).toBeDefined();
    expect(suggestAction?.details).toContain("component.ts");
  });

  test("should stop cleanly", async () => {
    const daemon = await startDaemon(testDir, {
      writeHistory: false,
      writeReports: false,
    });

    // Stop should not throw
    expect(() => daemon.stop()).not.toThrow();
  });
});
