export type { Project, Goal, Rule } from "./types";
export { parseProject, formatProject } from "./parser";
export {
  loadProject,
  saveProject,
  addGoal,
  updateGoalStatus,
  addRule,
  getGoalsSummary,
} from "./manager";
