import { parseRules, serializeRules } from "./parser";
import type { Rule, RulesFile } from "./types";

const RULES_PATH = ".crit/rules.md";

/**
 * Generate a simple hash ID from text
 */
function generateId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

/**
 * Create an empty RulesFile
 */
function emptyRulesFile(): RulesFile {
  return {
    sections: [],
    rules: [],
    raw: "",
  };
}

/**
 * Load rules from a project's .crit/rules.md file
 */
export async function loadRules(projectPath: string): Promise<RulesFile> {
  const filePath = `${projectPath}/${RULES_PATH}`;
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return emptyRulesFile();
  }

  try {
    const content = await file.text();
    return parseRules(content);
  } catch {
    return emptyRulesFile();
  }
}

/**
 * Save rules to a project's .crit/rules.md file
 */
export async function saveRules(projectPath: string, rules: RulesFile): Promise<void> {
  const dirPath = `${projectPath}/.crit`;
  const filePath = `${projectPath}/${RULES_PATH}`;

  // Ensure .crit directory exists
  const dir = Bun.file(dirPath);
  if (!(await Bun.file(`${dirPath}/.`).exists())) {
    await Bun.write(`${dirPath}/.gitkeep`, "");
  }

  const content = serializeRules(rules);
  await Bun.write(filePath, content);
}

/**
 * Add a new rule to a section
 */
export function addRule(rules: RulesFile, section: string, text: string): RulesFile {
  const newRule: Rule = {
    id: generateId(text),
    text,
    section,
    enabled: true,
  };

  const newSections = rules.sections.includes(section)
    ? [...rules.sections]
    : [...rules.sections, section];

  return {
    sections: newSections,
    rules: [...rules.rules, newRule],
    raw: rules.raw,
  };
}

/**
 * Remove a rule by ID
 */
export function removeRule(rules: RulesFile, id: string): RulesFile {
  const newRules = rules.rules.filter((r) => r.id !== id);

  // Clean up empty sections
  const usedSections = new Set(newRules.map((r) => r.section));
  const newSections = rules.sections.filter((s) => usedSections.has(s));

  return {
    sections: newSections,
    rules: newRules,
    raw: rules.raw,
  };
}

/**
 * Toggle a rule's enabled state
 */
export function toggleRule(rules: RulesFile, id: string): RulesFile {
  const newRules = rules.rules.map((r) =>
    r.id === id ? { ...r, enabled: !r.enabled } : r
  );

  return {
    ...rules,
    rules: newRules,
  };
}

/**
 * Format rules for LLM prompt injection
 */
export function formatForLLM(rules: RulesFile): string {
  const enabledRules = rules.rules.filter((r) => r.enabled);

  if (enabledRules.length === 0) {
    return "";
  }

  const lines: string[] = ["# Project Rules", ""];

  // Group by section
  const bySection = new Map<string, Rule[]>();
  for (const rule of enabledRules) {
    const existing = bySection.get(rule.section) || [];
    existing.push(rule);
    bySection.set(rule.section, existing);
  }

  // Format each section
  for (const section of rules.sections) {
    const sectionRules = bySection.get(section);
    if (!sectionRules || sectionRules.length === 0) continue;

    lines.push(`## ${section}`);
    for (const rule of sectionRules) {
      lines.push(`- ${rule.text}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}
