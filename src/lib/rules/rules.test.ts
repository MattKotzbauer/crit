import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { parseRules, serializeRules } from "./parser";
import {
  loadRules,
  saveRules,
  addRule,
  removeRule,
  toggleRule,
  formatForLLM,
} from "./manager";
import type { RulesFile } from "./types";

const SAMPLE_RULES = `# Project Rules

## Code Style
- Keep functions under 50 lines
- Prefer composition over inheritance

## Architecture
- All API endpoints must have error handling
- Use dependency injection for services
`;

describe("parseRules", () => {
  test("parses sections from ## headers", () => {
    const result = parseRules(SAMPLE_RULES);
    expect(result.sections).toEqual(["Code Style", "Architecture"]);
  });

  test("parses rules from bullet points", () => {
    const result = parseRules(SAMPLE_RULES);
    expect(result.rules).toHaveLength(4);
    expect(result.rules[0]?.text).toBe("Keep functions under 50 lines");
    expect(result.rules[0]?.section).toBe("Code Style");
    expect(result.rules[0]?.enabled).toBe(true);
  });

  test("assigns rules to correct sections", () => {
    const result = parseRules(SAMPLE_RULES);
    const codeStyleRules = result.rules.filter((r) => r.section === "Code Style");
    const archRules = result.rules.filter((r) => r.section === "Architecture");
    expect(codeStyleRules).toHaveLength(2);
    expect(archRules).toHaveLength(2);
  });

  test("generates unique ids for rules", () => {
    const result = parseRules(SAMPLE_RULES);
    const ids = result.rules.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  test("handles empty content", () => {
    const result = parseRules("");
    expect(result.sections).toEqual([]);
    expect(result.rules).toEqual([]);
  });

  test("handles content with no sections", () => {
    const content = "- Rule without section";
    const result = parseRules(content);
    expect(result.sections).toEqual(["General"]);
    expect(result.rules[0]?.section).toBe("General");
  });

  test("stores raw content", () => {
    const result = parseRules(SAMPLE_RULES);
    expect(result.raw).toBe(SAMPLE_RULES);
  });
});

describe("serializeRules", () => {
  test("converts RulesFile back to markdown", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const serialized = serializeRules(rulesFile);
    expect(serialized).toContain("## Code Style");
    expect(serialized).toContain("- Keep functions under 50 lines");
    expect(serialized).toContain("## Architecture");
  });

  test("excludes disabled rules", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    rulesFile.rules[0]!.enabled = false;
    const serialized = serializeRules(rulesFile);
    expect(serialized).not.toContain("Keep functions under 50 lines");
  });
});

describe("addRule", () => {
  test("adds a new rule to existing section", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const updated = addRule(rulesFile, "Code Style", "Use TypeScript strict mode");
    expect(updated.rules).toHaveLength(5);
    const newRule = updated.rules.find((r) => r.text === "Use TypeScript strict mode");
    expect(newRule).toBeDefined();
    expect(newRule?.section).toBe("Code Style");
    expect(newRule?.enabled).toBe(true);
  });

  test("adds a new section if it doesn't exist", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const updated = addRule(rulesFile, "Testing", "Write unit tests for all functions");
    expect(updated.sections).toContain("Testing");
    expect(updated.rules).toHaveLength(5);
  });

  test("does not mutate original", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const originalLength = rulesFile.rules.length;
    addRule(rulesFile, "Code Style", "New rule");
    expect(rulesFile.rules.length).toBe(originalLength);
  });
});

describe("removeRule", () => {
  test("removes a rule by id", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const ruleToRemove = rulesFile.rules[0]!;
    const updated = removeRule(rulesFile, ruleToRemove.id);
    expect(updated.rules).toHaveLength(3);
    expect(updated.rules.find((r) => r.id === ruleToRemove.id)).toBeUndefined();
  });

  test("removes empty sections", () => {
    const rulesFile: RulesFile = {
      sections: ["OnlySection"],
      rules: [{ id: "1", text: "Only rule", section: "OnlySection", enabled: true }],
      raw: "",
    };
    const updated = removeRule(rulesFile, "1");
    expect(updated.sections).toEqual([]);
    expect(updated.rules).toEqual([]);
  });

  test("does not mutate original", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const originalLength = rulesFile.rules.length;
    removeRule(rulesFile, rulesFile.rules[0]!.id);
    expect(rulesFile.rules.length).toBe(originalLength);
  });
});

describe("toggleRule", () => {
  test("toggles rule enabled state", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const rule = rulesFile.rules[0]!;
    expect(rule.enabled).toBe(true);

    const updated = toggleRule(rulesFile, rule.id);
    const toggledRule = updated.rules.find((r) => r.id === rule.id)!;
    expect(toggledRule.enabled).toBe(false);

    const reToggled = toggleRule(updated, rule.id);
    const reToggledRule = reToggled.rules.find((r) => r.id === rule.id)!;
    expect(reToggledRule.enabled).toBe(true);
  });
});

describe("formatForLLM", () => {
  test("formats enabled rules for LLM consumption", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    const formatted = formatForLLM(rulesFile);
    expect(formatted).toContain("# Project Rules");
    expect(formatted).toContain("## Code Style");
    expect(formatted).toContain("- Keep functions under 50 lines");
  });

  test("excludes disabled rules", () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    rulesFile.rules[0]!.enabled = false;
    const formatted = formatForLLM(rulesFile);
    expect(formatted).not.toContain("Keep functions under 50 lines");
    expect(formatted).toContain("Prefer composition over inheritance");
  });

  test("returns empty string when no enabled rules", () => {
    const rulesFile: RulesFile = {
      sections: [],
      rules: [],
      raw: "",
    };
    const formatted = formatForLLM(rulesFile);
    expect(formatted).toBe("");
  });

  test("omits sections with no enabled rules", () => {
    const rulesFile: RulesFile = {
      sections: ["Active", "Inactive"],
      rules: [
        { id: "1", text: "Active rule", section: "Active", enabled: true },
        { id: "2", text: "Disabled rule", section: "Inactive", enabled: false },
      ],
      raw: "",
    };
    const formatted = formatForLLM(rulesFile);
    expect(formatted).toContain("## Active");
    expect(formatted).not.toContain("## Inactive");
  });
});

describe("loadRules and saveRules", () => {
  const testDir = "/tmp/crit-rules-test";

  beforeEach(async () => {
    // Clean up test directory
    try {
      await Bun.$`rm -rf ${testDir}`.quiet();
    } catch {
      // Ignore if doesn't exist
    }
    await Bun.$`mkdir -p ${testDir}`.quiet();
  });

  afterEach(async () => {
    try {
      await Bun.$`rm -rf ${testDir}`.quiet();
    } catch {
      // Ignore
    }
  });

  test("returns empty RulesFile when file doesn't exist", async () => {
    const result = await loadRules(testDir);
    expect(result.sections).toEqual([]);
    expect(result.rules).toEqual([]);
    expect(result.raw).toBe("");
  });

  test("saves and loads rules", async () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    await saveRules(testDir, rulesFile);

    const loaded = await loadRules(testDir);
    expect(loaded.sections).toEqual(rulesFile.sections);
    expect(loaded.rules.length).toBe(rulesFile.rules.length);
  });

  test("creates .crit directory if needed", async () => {
    const rulesFile = parseRules(SAMPLE_RULES);
    await saveRules(testDir, rulesFile);

    const file = Bun.file(`${testDir}/.crit/rules.md`);
    expect(await file.exists()).toBe(true);
  });
});
