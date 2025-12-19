/**
 * Project types - unified goals + rules from project.md
 */

export interface Goal {
  text: string;
  status?: "planned" | "working" | "partial" | "done" | "broken";
}

export interface Rule {
  text: string;
  category?: string;
}

export interface Project {
  goals: Goal[];
  rules: Rule[];
  raw: string;
}
