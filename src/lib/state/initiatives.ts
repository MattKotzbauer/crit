import { join } from "path";
import type { Initiative } from "./types";

const STATE_DIR = ".crit/state";
const INITIATIVES_FILE = "initiatives.json";

function getInitiativesPath(projectPath: string): string {
  return join(projectPath, STATE_DIR, INITIATIVES_FILE);
}

function generateId(): string {
  return crypto.randomUUID();
}

export async function loadInitiatives(
  projectPath: string
): Promise<Initiative[]> {
  const initiativesPath = getInitiativesPath(projectPath);
  const file = Bun.file(initiativesPath);

  if (!(await file.exists())) {
    return [];
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as Initiative[];
  } catch {
    return [];
  }
}

export async function saveInitiatives(
  projectPath: string,
  initiatives: Initiative[]
): Promise<void> {
  const initiativesPath = getInitiativesPath(projectPath);
  await Bun.write(initiativesPath, JSON.stringify(initiatives, null, 2));
}

export async function addInitiative(
  projectPath: string,
  initiative: Omit<Initiative, "id" | "createdAt" | "status">
): Promise<string> {
  const initiatives = await loadInitiatives(projectPath);

  const id = generateId();
  const newInitiative: Initiative = {
    ...initiative,
    id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  initiatives.push(newInitiative);
  await saveInitiatives(projectPath, initiatives);

  return id;
}

export async function updateInitiative(
  projectPath: string,
  id: string,
  updates: Partial<Omit<Initiative, "id" | "createdAt">>
): Promise<void> {
  const initiatives = await loadInitiatives(projectPath);

  const index = initiatives.findIndex((i) => i.id === id);
  if (index === -1) {
    throw new Error(`Initiative not found: ${id}`);
  }

  initiatives[index] = {
    ...initiatives[index],
    ...updates,
  };

  await saveInitiatives(projectPath, initiatives);
}

const PRIORITY_ORDER: Record<Initiative["priority"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

export async function getNextInitiative(
  projectPath: string
): Promise<Initiative | null> {
  const initiatives = await loadInitiatives(projectPath);

  const pending = initiatives.filter((i) => i.status === "pending");

  if (pending.length === 0) {
    return null;
  }

  // Sort by priority (highest first), then by creation date (oldest first)
  pending.sort((a, b) => {
    const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });

  return pending[0];
}
