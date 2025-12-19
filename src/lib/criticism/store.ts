/**
 * Criticism store - manages pending criticisms
 *
 * Criticisms are stored in .crit/state/criticisms.json
 * and updated incrementally as analysis runs and user acts
 */

import { join } from "path";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import type { Criticism, CriticismStore, CriticismCategory, CriticismStatus } from "./types";

const CRITICISMS_FILE = "criticisms.json";

function getCriticismsPath(projectRoot: string): string {
  return join(projectRoot, ".crit", "state", CRITICISMS_FILE);
}

function ensureStateDir(projectRoot: string): void {
  const stateDir = join(projectRoot, ".crit", "state");
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
}

export function loadCriticisms(projectRoot: string): CriticismStore {
  const filePath = getCriticismsPath(projectRoot);

  if (!existsSync(filePath)) {
    return {
      criticisms: [],
      lastAnalysis: new Date().toISOString(),
    };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as CriticismStore;
  } catch {
    return {
      criticisms: [],
      lastAnalysis: new Date().toISOString(),
    };
  }
}

export function saveCriticisms(projectRoot: string, store: CriticismStore): void {
  ensureStateDir(projectRoot);
  const filePath = getCriticismsPath(projectRoot);
  writeFileSync(filePath, JSON.stringify(store, null, 2));
}

export function addCriticism(projectRoot: string, criticism: Criticism): void {
  const store = loadCriticisms(projectRoot);

  // Avoid duplicates by checking id
  const existing = store.criticisms.findIndex(c => c.id === criticism.id);
  if (existing >= 0) {
    store.criticisms[existing] = criticism;
  } else {
    store.criticisms.push(criticism);
  }

  saveCriticisms(projectRoot, store);
}

export function updateCriticismStatus(
  projectRoot: string,
  criticismId: string,
  status: CriticismStatus,
  reasoning?: string
): Criticism | null {
  const store = loadCriticisms(projectRoot);
  const criticism = store.criticisms.find(c => c.id === criticismId);

  if (!criticism) {
    return null;
  }

  criticism.status = status;
  if (reasoning) {
    criticism.reasoning = reasoning;
  }

  saveCriticisms(projectRoot, store);
  return criticism;
}

export function getPendingCriticisms(projectRoot: string): Criticism[] {
  const store = loadCriticisms(projectRoot);
  return store.criticisms.filter(c => c.status === "pending");
}

export function getCriticismsByCategory(
  projectRoot: string,
  category: CriticismCategory
): Criticism[] {
  const store = loadCriticisms(projectRoot);
  return store.criticisms.filter(c => c.category === category && c.status === "pending");
}

export function removeCriticism(projectRoot: string, criticismId: string): boolean {
  const store = loadCriticisms(projectRoot);
  const index = store.criticisms.findIndex(c => c.id === criticismId);

  if (index < 0) {
    return false;
  }

  store.criticisms.splice(index, 1);
  saveCriticisms(projectRoot, store);
  return true;
}

export function clearResolvedCriticisms(projectRoot: string): number {
  const store = loadCriticisms(projectRoot);
  const before = store.criticisms.length;
  store.criticisms = store.criticisms.filter(c => c.status === "pending" || c.status === "skipped");
  const removed = before - store.criticisms.length;
  saveCriticisms(projectRoot, store);
  return removed;
}

// Generate a unique ID for a criticism based on its content
export function generateCriticismId(category: CriticismCategory, subject: string, files: string[]): string {
  const base = `${category}-${subject}-${files.sort().join(",")}`;
  // Simple hash
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `${category.toLowerCase()}-${Math.abs(hash).toString(16).slice(0, 8)}`;
}
