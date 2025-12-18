import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { rm, mkdir, writeFile } from "fs/promises";

import {
  isTestFile,
  isSourceFile,
  getExpectedTestPaths,
  findTestFile,
  hasTests,
  getUntestedFiles,
  getTestStatus,
  parseTestFile,
  parseSourceFile,
} from "./tracker";
import {
  getTestRequirements,
  canMarkDone,
  verifyTests,
} from "./enforcer";

const TEST_DIR = "/tmp/crit-testing-test";
const SRC_DIR = join(TEST_DIR, "src");
const LIB_DIR = join(SRC_DIR, "lib");

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(LIB_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("isTestFile", () => {
  test("detects .test.ts files", () => {
    expect(isTestFile("foo.test.ts")).toBe(true);
    expect(isTestFile("src/lib/foo.test.ts")).toBe(true);
  });

  test("detects .spec.ts files", () => {
    expect(isTestFile("foo.spec.ts")).toBe(true);
    expect(isTestFile("src/lib/foo.spec.ts")).toBe(true);
  });

  test("detects __tests__ directory files", () => {
    expect(isTestFile("__tests__/foo.ts")).toBe(true);
    expect(isTestFile("src/__tests__/bar.ts")).toBe(true);
  });

  test("returns false for regular source files", () => {
    expect(isTestFile("foo.ts")).toBe(false);
    expect(isTestFile("src/lib/utils.ts")).toBe(false);
  });
});

describe("isSourceFile", () => {
  test("detects TypeScript source files", () => {
    expect(isSourceFile("/project/src/lib/utils.ts")).toBe(true);
    expect(isSourceFile("/project/src/main.tsx")).toBe(true);
  });

  test("excludes test files", () => {
    expect(isSourceFile("/project/src/lib/utils.test.ts")).toBe(false);
    expect(isSourceFile("/project/src/__tests__/utils.ts")).toBe(false);
  });

  test("excludes type-only files", () => {
    expect(isSourceFile("/project/src/types.ts")).toBe(false);
    expect(isSourceFile("/project/src/lib/types.d.ts")).toBe(false);
  });

  test("excludes index files", () => {
    expect(isSourceFile("/project/src/lib/index.ts")).toBe(false);
  });
});

describe("getExpectedTestPaths", () => {
  test("generates expected test file paths", () => {
    const paths = getExpectedTestPaths("src/lib/utils.ts");

    expect(paths).toContain("src/lib/utils.test.ts");
    expect(paths).toContain("src/lib/utils.spec.ts");
    expect(paths).toContain("src/lib/__tests__/utils.test.ts");
  });
});

describe("findTestFile", () => {
  test("finds existing test file", async () => {
    // Create source and test file
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "utils.test.ts"),
      "test('foo', () => {})"
    );

    const testFile = await findTestFile(TEST_DIR, "src/lib/utils.ts");

    expect(testFile).toBe("src/lib/utils.test.ts");
  });

  test("returns null when no test file exists", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");

    const testFile = await findTestFile(TEST_DIR, "src/lib/utils.ts");

    expect(testFile).toBeNull();
  });

  test("finds __tests__ directory test file", async () => {
    await mkdir(join(LIB_DIR, "__tests__"), { recursive: true });
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "__tests__", "utils.test.ts"),
      "test('foo', () => {})"
    );

    const testFile = await findTestFile(TEST_DIR, "src/lib/utils.ts");

    expect(testFile).toBe("src/lib/__tests__/utils.test.ts");
  });
});

describe("hasTests", () => {
  test("returns true when test file exists", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "utils.test.ts"),
      "test('foo', () => {})"
    );

    const result = await hasTests(TEST_DIR, "src/lib/utils.ts");

    expect(result).toBe(true);
  });

  test("returns false when no test file exists", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");

    const result = await hasTests(TEST_DIR, "src/lib/utils.ts");

    expect(result).toBe(false);
  });

  test("returns true for test files themselves", async () => {
    await writeFile(
      join(LIB_DIR, "utils.test.ts"),
      "test('foo', () => {})"
    );

    const result = await hasTests(TEST_DIR, "src/lib/utils.test.ts");

    expect(result).toBe(true);
  });
});

describe("getUntestedFiles", () => {
  test("returns files without tests", async () => {
    await writeFile(join(LIB_DIR, "tested.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "tested.test.ts"),
      "test('foo', () => {})"
    );
    await writeFile(
      join(LIB_DIR, "untested.ts"),
      "export function bar() {}"
    );

    const untested = await getUntestedFiles(TEST_DIR);

    expect(untested).toContain("src/lib/untested.ts");
    expect(untested).not.toContain("src/lib/tested.ts");
  });
});

describe("getTestStatus", () => {
  test("returns correct status summary", async () => {
    await writeFile(join(LIB_DIR, "tested.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "tested.test.ts"),
      "test('foo', () => {})"
    );
    await writeFile(
      join(LIB_DIR, "untested.ts"),
      "export function bar() {}"
    );

    const status = await getTestStatus(TEST_DIR);

    expect(status.totalFiles).toBe(2);
    expect(status.testedFiles).toBe(1);
    expect(status.untestedFiles).toContain("src/lib/untested.ts");
  });
});

describe("parseTestFile", () => {
  test("extracts test and describe blocks", async () => {
    const testContent = `
import { describe, test, expect } from "bun:test";

describe("Calculator", () => {
  test("adds numbers", () => {
    expect(1 + 1).toBe(2);
  });

  it("subtracts numbers", () => {
    expect(2 - 1).toBe(1);
  });
});
`;
    const testPath = join(LIB_DIR, "calc.test.ts");
    await writeFile(testPath, testContent);

    const info = await parseTestFile(testPath);

    expect(info.tests.length).toBe(3);
    expect(info.tests.find((t) => t.name === "Calculator")).toBeDefined();
    expect(info.tests.find((t) => t.name === "adds numbers")).toBeDefined();
    expect(info.tests.find((t) => t.name === "subtracts numbers")).toBeDefined();
  });
});

describe("parseSourceFile", () => {
  test("extracts exported functions", async () => {
    const sourceContent = `
export function add(a: number, b: number): number {
  return a + b;
}

export async function fetchData() {
  return [];
}

export const multiply = (a: number, b: number) => a * b;

function privateFunc() {}
`;
    const sourcePath = join(LIB_DIR, "math.ts");
    await writeFile(sourcePath, sourceContent);

    const functions = await parseSourceFile(sourcePath);

    expect(functions).toContain("add");
    expect(functions).toContain("fetchData");
    expect(functions).toContain("multiply");
    expect(functions).not.toContain("privateFunc");
  });
});

describe("getTestRequirements", () => {
  test("returns requirements for untested files", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");

    const requirements = await getTestRequirements(TEST_DIR, [
      "src/lib/utils.ts",
    ]);

    expect(requirements.length).toBe(1);
    expect(requirements[0].file).toBe("src/lib/utils.ts");
    expect(requirements[0].priority).toBe("high"); // lib files are high priority
  });

  test("returns empty for tested files", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "utils.test.ts"),
      "test('foo', () => {})"
    );

    const requirements = await getTestRequirements(TEST_DIR, [
      "src/lib/utils.ts",
    ]);

    expect(requirements.length).toBe(0);
  });
});

describe("canMarkDone", () => {
  test("returns true when all files have tests", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");
    await writeFile(
      join(LIB_DIR, "utils.test.ts"),
      "test('foo', () => {})"
    );

    const result = await canMarkDone(TEST_DIR, ["src/lib/utils.ts"]);

    expect(result.canMark).toBe(true);
    expect(result.blockers.length).toBe(0);
  });

  test("returns false with blockers when tests missing", async () => {
    await writeFile(join(LIB_DIR, "utils.ts"), "export function foo() {}");

    const result = await canMarkDone(TEST_DIR, ["src/lib/utils.ts"]);

    expect(result.canMark).toBe(false);
    expect(result.blockers.length).toBe(1);
  });
});

describe("verifyTests", () => {
  test("runs bun test and returns result", async () => {
    // Create a simple passing test
    await writeFile(
      join(TEST_DIR, "simple.test.ts"),
      `import { test, expect } from "bun:test";
test("passes", () => {
  expect(1 + 1).toBe(2);
});`
    );

    const result = await verifyTests(TEST_DIR);

    expect(result.passed).toBe(true);
  });

  test("reports failing tests", async () => {
    // Create a failing test
    await writeFile(
      join(TEST_DIR, "failing.test.ts"),
      `import { test, expect } from "bun:test";
test("fails", () => {
  expect(1 + 1).toBe(3);
});`
    );

    const result = await verifyTests(TEST_DIR);

    expect(result.passed).toBe(false);
    expect(result.output).toContain("fail");
  });
});
