/**
 * Preferences manager - tracks user decisions on criticisms
 *
 * Stores in .crit/context/preferences.md as LLM-readable format
 * Incremental updates only - appends lines, never rewrites
 */

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "fs";
import type { Criticism, CriticismCategory } from "./types";

const PREFERENCES_FILE = "preferences.md";

function getPreferencesPath(projectRoot: string): string {
  return join(projectRoot, ".crit", "context", PREFERENCES_FILE);
}

function ensureContextDir(projectRoot: string): void {
  const contextDir = join(projectRoot, ".crit", "context");
  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }
}

const INITIAL_CONTENT = `# User Preferences

This file tracks user decisions on suggested changes.
The LLM should use this to avoid suggesting rejected patterns again.

## Accepted

## Rejected

`;

export function initPreferences(projectRoot: string): void {
  ensureContextDir(projectRoot);
  const filePath = getPreferencesPath(projectRoot);

  if (!existsSync(filePath)) {
    writeFileSync(filePath, INITIAL_CONTENT);
  }
}

export function loadPreferences(projectRoot: string): string {
  const filePath = getPreferencesPath(projectRoot);

  if (!existsSync(filePath)) {
    initPreferences(projectRoot);
  }

  return readFileSync(filePath, "utf-8");
}

function formatDate(): string {
  return new Date().toISOString().split("T")[0];
}

function formatEntry(criticism: Criticism): string {
  const reasoning = criticism.reasoning ? ` - "${criticism.reasoning}"` : "";
  const location = criticism.location || criticism.files[0] || "";
  return `- ${formatDate()}: ${criticism.category} \`${criticism.subject}\` in ${location}${reasoning}`;
}

export function logAccepted(projectRoot: string, criticism: Criticism): void {
  ensureContextDir(projectRoot);
  const filePath = getPreferencesPath(projectRoot);

  if (!existsSync(filePath)) {
    initPreferences(projectRoot);
  }

  const content = readFileSync(filePath, "utf-8");
  const entry = formatEntry(criticism);

  // Find the "## Accepted" section and append after it
  const acceptedMatch = content.match(/## Accepted\n/);
  if (acceptedMatch && acceptedMatch.index !== undefined) {
    const insertPos = acceptedMatch.index + acceptedMatch[0].length;
    const newContent = content.slice(0, insertPos) + entry + "\n" + content.slice(insertPos);
    writeFileSync(filePath, newContent);
  } else {
    // Fallback: just append
    appendFileSync(filePath, `\n${entry}\n`);
  }
}

export function logRejected(projectRoot: string, criticism: Criticism): void {
  ensureContextDir(projectRoot);
  const filePath = getPreferencesPath(projectRoot);

  if (!existsSync(filePath)) {
    initPreferences(projectRoot);
  }

  const content = readFileSync(filePath, "utf-8");
  const entry = formatEntry(criticism);

  // Find the "## Rejected" section and append after it
  const rejectedMatch = content.match(/## Rejected\n/);
  if (rejectedMatch && rejectedMatch.index !== undefined) {
    const insertPos = rejectedMatch.index + rejectedMatch[0].length;
    const newContent = content.slice(0, insertPos) + entry + "\n" + content.slice(insertPos);
    writeFileSync(filePath, newContent);
  } else {
    // Fallback: just append
    appendFileSync(filePath, `\n${entry}\n`);
  }
}

// Parse preferences to check if a pattern was previously rejected
export interface ParsedPreference {
  date: string;
  category: CriticismCategory;
  subject: string;
  location: string;
  reasoning?: string;
  decision: "accepted" | "rejected";
}

export function parsePreferences(projectRoot: string): ParsedPreference[] {
  const content = loadPreferences(projectRoot);
  const preferences: ParsedPreference[] = [];

  let currentSection: "accepted" | "rejected" | null = null;

  for (const line of content.split("\n")) {
    if (line.startsWith("## Accepted")) {
      currentSection = "accepted";
      continue;
    }
    if (line.startsWith("## Rejected")) {
      currentSection = "rejected";
      continue;
    }

    if (!currentSection || !line.startsWith("- ")) continue;

    // Parse: - YYYY-MM-DD: CATEGORY `subject` in location - "reasoning"
    const match = line.match(/^- (\d{4}-\d{2}-\d{2}): (ELIM|SIMPLIFY|TEST) `([^`]+)` in ([^\s-]+)(?:\s*-\s*"([^"]*)")?/);
    if (match) {
      preferences.push({
        date: match[1],
        category: match[2] as CriticismCategory,
        subject: match[3],
        location: match[4],
        reasoning: match[5],
        decision: currentSection,
      });
    }
  }

  return preferences;
}

// Check if a similar criticism was previously rejected
export function wasRejected(projectRoot: string, category: CriticismCategory, subject: string): boolean {
  const preferences = parsePreferences(projectRoot);
  return preferences.some(
    p => p.decision === "rejected" && p.category === category && p.subject.toLowerCase() === subject.toLowerCase()
  );
}

// Get rejection reasoning if available
export function getRejectionReason(projectRoot: string, category: CriticismCategory, subject: string): string | null {
  const preferences = parsePreferences(projectRoot);
  const match = preferences.find(
    p => p.decision === "rejected" && p.category === category && p.subject.toLowerCase() === subject.toLowerCase()
  );
  return match?.reasoning || null;
}
