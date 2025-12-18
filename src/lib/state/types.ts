export interface SessionState {
  lastActive: string; // ISO date
  currentFocus: string | null;
  stats: {
    simplifications: number;
    rulesApplied: number;
    docsUpdated: number;
  };
}

export interface HistoryEntry {
  timestamp: string;
  action: "simplify" | "fix" | "update_docs" | "apply_rule" | "suggest";
  description: string;
  files: string[];
}

export interface Initiative {
  id: string;
  priority: "low" | "medium" | "high";
  type: "simplify" | "fix" | "cleanup" | "suggest";
  description: string;
  files: string[];
  status: "pending" | "completed" | "rejected";
  createdAt: string;
}
