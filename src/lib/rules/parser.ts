import type { Rule, RulesFile } from "./types";

/**
 * Generate a simple hash ID from text
 */
function generateId(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}

/**
 * Parse markdown content into structured rules
 */
export function parseRules(content: string): RulesFile {
  const lines = content.split("\n");
  const sections: string[] = [];
  const rules: Rule[] = [];

  let currentSection = "General";

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for section header (## Header)
    if (trimmed.startsWith("## ")) {
      currentSection = trimmed.slice(3).trim();
      if (!sections.includes(currentSection)) {
        sections.push(currentSection);
      }
      continue;
    }

    // Check for rule (- bullet point)
    if (trimmed.startsWith("- ")) {
      const text = trimmed.slice(2).trim();
      if (text) {
        // Ensure section exists
        if (!sections.includes(currentSection)) {
          sections.push(currentSection);
        }

        rules.push({
          id: generateId(text),
          text,
          section: currentSection,
          enabled: true,
        });
      }
    }
  }

  return {
    sections,
    rules,
    raw: content,
  };
}

/**
 * Convert RulesFile back to markdown
 */
export function serializeRules(rulesFile: RulesFile): string {
  const lines: string[] = ["# Project Rules", ""];

  // Group rules by section
  const rulesBySection = new Map<string, Rule[]>();
  for (const rule of rulesFile.rules) {
    if (!rule.enabled) continue;
    const existing = rulesBySection.get(rule.section) || [];
    existing.push(rule);
    rulesBySection.set(rule.section, existing);
  }

  // Output each section
  for (const section of rulesFile.sections) {
    const sectionRules = rulesBySection.get(section);
    if (!sectionRules || sectionRules.length === 0) continue;

    lines.push(`## ${section}`);
    for (const rule of sectionRules) {
      lines.push(`- ${rule.text}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
