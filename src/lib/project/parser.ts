/**
 * Project parser - reads .crit/project.md
 *
 * Parses markdown with ## Goals and ## Rules sections.
 * Flexible - accepts various heading names.
 */

import type { Project, Goal, Rule } from "./types";

const GOAL_HEADINGS = ["goals", "deliverables", "features", "what", "building"];
const RULE_HEADINGS = ["rules", "constraints", "guidelines", "how", "principles"];

interface Section {
  name: string;
  content: string[];
}

function parseMarkdownSections(content: string): Section[] {
  const lines = content.split("\n");
  const sections: Section[] = [];
  let currentSection: Section | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = { name: headingMatch[1].toLowerCase().trim(), content: [] };
    } else if (currentSection) {
      currentSection.content.push(line);
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

function parseListItems(lines: string[]): string[] {
  const items: string[] = [];

  for (const line of lines) {
    // Match list items: - item, * item, or numbered 1. item
    const match = line.match(/^\s*[-*]\s+(.+)$/) || line.match(/^\s*\d+\.\s+(.+)$/);
    if (match) {
      const text = match[1].trim();
      // Skip empty items or comment placeholders
      if (text && !text.startsWith("<!--")) {
        items.push(text);
      }
    }
  }

  return items;
}

function parseGoal(text: string): Goal {
  // Check for status markers: [x] done, [~] partial, [!] broken, [ ] planned
  const statusMatch = text.match(/^\[(.)\]\s*(.+)$/);
  if (statusMatch) {
    const marker = statusMatch[1];
    const goalText = statusMatch[2];
    let status: Goal["status"] = "planned";

    switch (marker) {
      case "x":
      case "X":
        status = "done";
        break;
      case "~":
        status = "partial";
        break;
      case "!":
        status = "broken";
        break;
      case " ":
        status = "planned";
        break;
      default:
        status = "working";
    }

    return { text: goalText, status };
  }

  return { text, status: "planned" };
}

export function parseProject(content: string): Project {
  const sections = parseMarkdownSections(content);

  let goals: Goal[] = [];
  let rules: Rule[] = [];

  for (const section of sections) {
    const sectionName = section.name.split(/\s+/)[0]; // First word

    if (GOAL_HEADINGS.some((h) => sectionName.includes(h))) {
      const items = parseListItems(section.content);
      goals = items.map(parseGoal);
    } else if (RULE_HEADINGS.some((h) => sectionName.includes(h))) {
      const items = parseListItems(section.content);
      rules = items.map((text) => ({ text }));
    }
  }

  return { goals, rules, raw: content };
}

export function formatProject(project: Project): string {
  const lines: string[] = ["# Project", ""];

  lines.push("## Goals");
  for (const goal of project.goals) {
    let marker = " ";
    switch (goal.status) {
      case "done":
        marker = "x";
        break;
      case "partial":
        marker = "~";
        break;
      case "broken":
        marker = "!";
        break;
      case "working":
        marker = ">";
        break;
    }
    lines.push(`- [${marker}] ${goal.text}`);
  }
  lines.push("");

  lines.push("## Rules");
  for (const rule of project.rules) {
    lines.push(`- ${rule.text}`);
  }
  lines.push("");

  return lines.join("\n");
}
