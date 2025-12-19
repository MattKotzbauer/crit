/**
 * Status manager - tracks project status for LLM context
 *
 * Stores in .crit/context/status.md as LLM-readable format
 * Incremental updates - modifies specific sections
 */

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";

const STATUS_FILE = "status.md";

function getStatusPath(projectRoot: string): string {
  return join(projectRoot, ".crit", "context", STATUS_FILE);
}

function ensureContextDir(projectRoot: string): void {
  const contextDir = join(projectRoot, ".crit", "context");
  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }
}

const INITIAL_CONTENT = `# Project Status

## Deliverables

## Insights

## Current Focus

`;

export function initStatus(projectRoot: string): void {
  ensureContextDir(projectRoot);
  const filePath = getStatusPath(projectRoot);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, INITIAL_CONTENT);
  }
}

export function loadStatus(projectRoot: string): string {
  const filePath = getStatusPath(projectRoot);

  if (!existsSync(filePath)) {
    initStatus(projectRoot);
  }

  return readFileSync(filePath, "utf-8");
}

export interface Deliverable {
  name: string;
  done: boolean;
  inProgress?: boolean;
}

export interface ProjectStatus {
  deliverables: Deliverable[];
  insights: string[];
  currentFocus: string | null;
}

export function parseStatus(projectRoot: string): ProjectStatus {
  const content = loadStatus(projectRoot);
  const status: ProjectStatus = {
    deliverables: [],
    insights: [],
    currentFocus: null,
  };

  let currentSection: "deliverables" | "insights" | "focus" | null = null;

  for (const line of content.split("\n")) {
    if (line.startsWith("## Deliverables")) {
      currentSection = "deliverables";
      continue;
    }
    if (line.startsWith("## Insights")) {
      currentSection = "insights";
      continue;
    }
    if (line.startsWith("## Current Focus")) {
      currentSection = "focus";
      continue;
    }

    if (!currentSection || !line.trim()) continue;

    if (currentSection === "deliverables") {
      // Parse: - [x] Name or - [ ] Name (in progress)
      const match = line.match(/^- \[([ x])\] (.+?)(\s*\(in progress\))?$/);
      if (match) {
        status.deliverables.push({
          name: match[2].trim(),
          done: match[1] === "x",
          inProgress: !!match[3],
        });
      }
    } else if (currentSection === "insights") {
      // Parse: - insight text
      const match = line.match(/^- (.+)$/);
      if (match) {
        status.insights.push(match[1]);
      }
    } else if (currentSection === "focus") {
      // Just take the first non-empty line
      if (!status.currentFocus && line.trim()) {
        status.currentFocus = line.trim();
      }
    }
  }

  return status;
}

function formatDeliverables(deliverables: Deliverable[]): string {
  return deliverables
    .map(d => {
      const checkbox = d.done ? "[x]" : "[ ]";
      const suffix = d.inProgress ? " (in progress)" : "";
      return `- ${checkbox} ${d.name}${suffix}`;
    })
    .join("\n");
}

function formatInsights(insights: string[]): string {
  return insights.map(i => `- ${i}`).join("\n");
}

export function updateStatus(projectRoot: string, updates: Partial<ProjectStatus>): void {
  ensureContextDir(projectRoot);
  const current = parseStatus(projectRoot);

  const newStatus: ProjectStatus = {
    deliverables: updates.deliverables ?? current.deliverables,
    insights: updates.insights ?? current.insights,
    currentFocus: updates.currentFocus ?? current.currentFocus,
  };

  const content = `# Project Status

## Deliverables
${formatDeliverables(newStatus.deliverables)}

## Insights
${formatInsights(newStatus.insights)}

## Current Focus
${newStatus.currentFocus || ""}
`;

  const filePath = getStatusPath(projectRoot);
  writeFileSync(filePath, content);
}

export function addDeliverable(projectRoot: string, name: string, inProgress = false): void {
  const status = parseStatus(projectRoot);

  // Check if already exists
  if (!status.deliverables.some(d => d.name.toLowerCase() === name.toLowerCase())) {
    status.deliverables.push({ name, done: false, inProgress });
    updateStatus(projectRoot, { deliverables: status.deliverables });
  }
}

export function markDeliverableDone(projectRoot: string, name: string): void {
  const status = parseStatus(projectRoot);
  const deliverable = status.deliverables.find(d => d.name.toLowerCase() === name.toLowerCase());

  if (deliverable) {
    deliverable.done = true;
    deliverable.inProgress = false;
    updateStatus(projectRoot, { deliverables: status.deliverables });
  }
}

export function addInsight(projectRoot: string, insight: string): void {
  const status = parseStatus(projectRoot);

  // Check if similar insight already exists
  if (!status.insights.some(i => i.toLowerCase() === insight.toLowerCase())) {
    status.insights.push(insight);
    updateStatus(projectRoot, { insights: status.insights });
  }
}

export function setFocus(projectRoot: string, focus: string | null): void {
  updateStatus(projectRoot, { currentFocus: focus });
}
