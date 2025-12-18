/**
 * Deliverables Manager
 *
 * CRUD operations for deliverables - tracking what features work.
 */

import { join } from "path";
import type {
  Deliverable,
  DeliverableState,
  DeliverableSummary,
  DeliverableStatus
} from "./types";

const DELIVERABLES_FILE = ".crit/deliverables.json";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function getDeliverablePath(projectPath: string): string {
  return join(projectPath, DELIVERABLES_FILE);
}

function emptyState(): DeliverableState {
  return { deliverables: [], groups: [] };
}

/**
 * Load all deliverables
 */
export async function loadDeliverables(projectPath: string): Promise<DeliverableState> {
  const filePath = getDeliverablePath(projectPath);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return emptyState();
  }

  try {
    return await file.json() as DeliverableState;
  } catch {
    return emptyState();
  }
}

/**
 * Save deliverables state
 */
export async function saveDeliverables(
  projectPath: string,
  state: DeliverableState
): Promise<void> {
  const filePath = getDeliverablePath(projectPath);
  await Bun.write(filePath, JSON.stringify(state, null, 2));
}

/**
 * Add a new deliverable
 */
export async function addDeliverable(
  projectPath: string,
  deliverable: Omit<Deliverable, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const state = await loadDeliverables(projectPath);
  const now = new Date().toISOString();

  const newDeliverable: Deliverable = {
    ...deliverable,
    id: generateId(),
    createdAt: now,
    updatedAt: now,
  };

  state.deliverables.push(newDeliverable);
  await saveDeliverables(projectPath, state);

  return newDeliverable.id;
}

/**
 * Update a deliverable
 */
export async function updateDeliverable(
  projectPath: string,
  id: string,
  updates: Partial<Omit<Deliverable, 'id' | 'createdAt'>>
): Promise<void> {
  const state = await loadDeliverables(projectPath);
  const index = state.deliverables.findIndex(d => d.id === id);

  if (index === -1) {
    throw new Error(`Deliverable not found: ${id}`);
  }

  const existing = state.deliverables[index];
  const changelog = existing.changelog || [];

  // Track status changes
  if (updates.status && updates.status !== existing.status) {
    changelog.push({
      date: new Date().toISOString(),
      change: `Status: ${existing.status} → ${updates.status}`
    });
  }

  state.deliverables[index] = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
    changelog,
  };

  await saveDeliverables(projectPath, state);
}

/**
 * Mark deliverable as verified working
 */
export async function markWorking(
  projectPath: string,
  id: string,
  verificationMethod?: string
): Promise<void> {
  await updateDeliverable(projectPath, id, {
    status: 'working',
    lastVerified: new Date().toISOString(),
    verificationMethod,
  });
}

/**
 * Mark deliverable as broken
 */
export async function markBroken(
  projectPath: string,
  id: string,
  reason?: string
): Promise<void> {
  const state = await loadDeliverables(projectPath);
  const deliverable = state.deliverables.find(d => d.id === id);

  if (deliverable) {
    const changelog = deliverable.changelog || [];
    if (reason) {
      changelog.push({
        date: new Date().toISOString(),
        change: `Broken: ${reason}`
      });
    }
  }

  await updateDeliverable(projectPath, id, {
    status: 'broken',
  });
}

/**
 * Get deliverable by ID
 */
export async function getDeliverable(
  projectPath: string,
  id: string
): Promise<Deliverable | null> {
  const state = await loadDeliverables(projectPath);
  return state.deliverables.find(d => d.id === id) || null;
}

/**
 * Find deliverable by name (case-insensitive partial match)
 */
export async function findDeliverable(
  projectPath: string,
  name: string
): Promise<Deliverable[]> {
  const state = await loadDeliverables(projectPath);
  const search = name.toLowerCase();
  return state.deliverables.filter(
    d => d.name.toLowerCase().includes(search) ||
         d.description.toLowerCase().includes(search)
  );
}

/**
 * Get deliverables by status
 */
export async function getByStatus(
  projectPath: string,
  status: DeliverableStatus
): Promise<Deliverable[]> {
  const state = await loadDeliverables(projectPath);
  return state.deliverables.filter(d => d.status === status);
}

/**
 * Get summary of all deliverables
 */
export async function getSummary(projectPath: string): Promise<DeliverableSummary> {
  const state = await loadDeliverables(projectPath);
  const { deliverables, groups } = state;

  const byStatus = (status: DeliverableStatus) =>
    deliverables.filter(d => d.status === status).length;

  return {
    total: deliverables.length,
    working: byStatus('working'),
    partial: byStatus('partial'),
    broken: byStatus('broken'),
    untested: byStatus('untested'),
    planned: byStatus('planned'),
    byGroup: groups.map(g => ({
      name: g.name,
      working: g.deliverables.filter(id =>
        deliverables.find(d => d.id === id)?.status === 'working'
      ).length,
      total: g.deliverables.length,
    })),
  };
}

/**
 * Format deliverables for display
 */
export function formatForDisplay(state: DeliverableState): string {
  const lines: string[] = ['# Deliverables\n'];

  const statusEmoji: Record<DeliverableStatus, string> = {
    working: '✓',
    partial: '◐',
    broken: '✗',
    untested: '?',
    planned: '○',
  };

  // Group deliverables
  const grouped = new Map<string, Deliverable[]>();
  const ungrouped: Deliverable[] = [];

  for (const d of state.deliverables) {
    const group = state.groups.find(g => g.deliverables.includes(d.id));
    if (group) {
      const existing = grouped.get(group.name) || [];
      existing.push(d);
      grouped.set(group.name, existing);
    } else {
      ungrouped.push(d);
    }
  }

  // Format grouped
  for (const [groupName, items] of grouped) {
    lines.push(`## ${groupName}\n`);
    for (const d of items) {
      lines.push(`${statusEmoji[d.status]} **${d.name}** - ${d.description}`);
      if (d.entryPoint) {
        lines.push(`  └─ ${d.entryPoint}`);
      }
    }
    lines.push('');
  }

  // Format ungrouped
  if (ungrouped.length > 0) {
    lines.push('## Other\n');
    for (const d of ungrouped) {
      lines.push(`${statusEmoji[d.status]} **${d.name}** - ${d.description}`);
    }
  }

  return lines.join('\n');
}
