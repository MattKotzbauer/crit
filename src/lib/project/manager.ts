/**
 * Project manager - CRUD for project.md
 */

import { join } from "path";
import type { Project, Goal } from "./types";
import { parseProject, formatProject } from "./parser";

const PROJECT_FILE = ".crit/project.md";

export async function loadProject(projectPath: string): Promise<Project> {
  const filePath = join(projectPath, PROJECT_FILE);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return { goals: [], rules: [], raw: "" };
  }

  const content = await file.text();
  return parseProject(content);
}

export async function saveProject(projectPath: string, project: Project): Promise<void> {
  const filePath = join(projectPath, PROJECT_FILE);
  const content = formatProject(project);
  await Bun.write(filePath, content);
}

export async function addGoal(projectPath: string, text: string): Promise<void> {
  const project = await loadProject(projectPath);
  project.goals.push({ text, status: "planned" });
  await saveProject(projectPath, project);
}

export async function updateGoalStatus(
  projectPath: string,
  goalText: string,
  status: Goal["status"]
): Promise<boolean> {
  const project = await loadProject(projectPath);
  const goal = project.goals.find(
    (g) => g.text.toLowerCase().includes(goalText.toLowerCase())
  );

  if (!goal) {
    return false;
  }

  goal.status = status;
  await saveProject(projectPath, project);
  return true;
}

export async function addRule(projectPath: string, text: string): Promise<void> {
  const project = await loadProject(projectPath);
  project.rules.push({ text });
  await saveProject(projectPath, project);
}

export async function getGoalsSummary(projectPath: string): Promise<{
  total: number;
  done: number;
  working: number;
  planned: number;
  broken: number;
}> {
  const project = await loadProject(projectPath);

  return {
    total: project.goals.length,
    done: project.goals.filter((g) => g.status === "done").length,
    working: project.goals.filter((g) => g.status === "working" || g.status === "partial").length,
    planned: project.goals.filter((g) => g.status === "planned").length,
    broken: project.goals.filter((g) => g.status === "broken").length,
  };
}
