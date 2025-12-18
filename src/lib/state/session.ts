import { join } from "path";
import type { SessionState } from "./types";

const STATE_DIR = ".crit/state";
const SESSION_FILE = "session.json";

function getSessionPath(projectPath: string): string {
  return join(projectPath, STATE_DIR, SESSION_FILE);
}

function getDefaultSession(): SessionState {
  return {
    lastActive: new Date().toISOString(),
    currentFocus: null,
    stats: {
      simplifications: 0,
      rulesApplied: 0,
      docsUpdated: 0,
    },
  };
}

export async function loadSession(projectPath: string): Promise<SessionState> {
  const sessionPath = getSessionPath(projectPath);
  const file = Bun.file(sessionPath);

  if (!(await file.exists())) {
    return getDefaultSession();
  }

  try {
    const content = await file.text();
    return JSON.parse(content) as SessionState;
  } catch {
    return getDefaultSession();
  }
}

export async function saveSession(
  projectPath: string,
  state: SessionState
): Promise<void> {
  const sessionPath = getSessionPath(projectPath);
  const stateDir = join(projectPath, STATE_DIR);

  // Ensure directory exists
  await Bun.write(sessionPath, ""); // Creates parent dirs
  await Bun.write(sessionPath, JSON.stringify(state, null, 2));
}

export async function updateSession(
  projectPath: string,
  updates: Partial<SessionState>
): Promise<void> {
  const current = await loadSession(projectPath);

  const updated: SessionState = {
    ...current,
    ...updates,
    lastActive: new Date().toISOString(),
    stats: {
      ...current.stats,
      ...(updates.stats || {}),
    },
  };

  await saveSession(projectPath, updated);
}
