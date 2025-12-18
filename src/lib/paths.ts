import { join } from "path";
import { existsSync } from "fs";

export const CRIT_DIR = ".crit";

export function getCritDir(base: string = process.cwd()): string {
  return join(base, CRIT_DIR);
}

export function getCritPath(relative: string, base: string = process.cwd()): string {
  return join(getCritDir(base), relative);
}

export function critExists(base: string = process.cwd()): boolean {
  return existsSync(getCritDir(base));
}

export const paths = {
  config: "config.json",
  rules: "rules.md",
  context: "context",
  contextArchitecture: "context/architecture.md",
  contextOverview: "context/overview.md",
  state: "state",
  stateSession: "state/session.json",
  stateHistory: "state/history.jsonl",
} as const;
