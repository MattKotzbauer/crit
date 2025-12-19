/**
 * crit TUI - lazygit-style interface
 *
 * Navigate with hjkl or arrows, enter to select, q to quit
 */

import { loadProject, getGoalsSummary } from "../lib/project";
import type { Goal } from "../lib/project";
import { getRecentHistory } from "../lib/state/history";
import type { HistoryEntry } from "../lib/state/types";
import { existsSync, watch, type FSWatcher } from "fs";
import { join } from "path";
import { spawn } from "child_process";

// Cached data for panels
let cachedHistory: HistoryEntry[] = [];
let cachedGoals: Goal[] = [];
let historyWatcher: FSWatcher | null = null;
let projectWatcher: FSWatcher | null = null;

// ANSI escape codes
const ESC = "\x1b";
const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const BLUE = `${ESC}[34m`;
const CYAN = `${ESC}[36m`;
const MAGENTA = `${ESC}[35m`;

// ASCII Art
const LOGO = [
  `${MAGENTA}              __  __   ${RESET}`,
  `${MAGENTA}  ___________│__│╱  │_ ${RESET}`,
  `${MAGENTA}_╱ ___╲_  __ ╲  ╲   __╲${RESET}`,
  `${MAGENTA}╲  ╲___│  │ ╲╱  ││  │  ${RESET}`,
  `${MAGENTA} ╲___  >__│  │__││__│  ${RESET}`,
  `${MAGENTA}     ╲╱${RESET}`,
];

const ANIME = [
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣯⣫⣡⡿⡵⣫⣾⣿⡿⣋⣥⣶⣷⣾⣿⣿⣵⣦⣌⠻⣿⣿⣿⣿⣷⣻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢷⠝⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠯⢱⣫⢗⡞⢕⣿⣿⢿⣾⣿⣿⣿⣿⢿⣿⣿⣿⣿⣿⣿⣜⣿⡽⣿⣿⣷⣿⣿⣿⣿⣿⣷⣹⣿⣟⢿⣿⣿⣿⣯⣇⡸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⢠⣏⡟⢟⡾⣾⣿⢳⣿⡿⣷⣿⡿⡫⣾⣿⢿⣿⣿⣿⣿⣿⢻⣿⢿⣿⣿⣧⢿⣿⣿⣿⣿⣯⣿⣿⢸⣿⣿⣿⣇⡘⡽⣌⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⡿⠀⣿⡰⡞⣿⢳⣿⣷⣿⢟⣿⣿⢏⣬⣾⡇⢿⡏⢿⣿⣿⣿⣿⡏⣿⡌⣿⣿⣿⡟⣿⣿⣿⣿⣿⣿⣿⡇⢻⣿⣿⣿⡁⢷⢿⡌⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⢃⠀⢣⣽⣱⡿⣿⡏⣿⣏⣾⡟⣵⣿⣿⣿⣿⡜⣯⢊⢿⣿⣿⣿⣷⣿⡇⣮⢿⣿⣿⣹⣿⣿⣿⣿⣿⣿⣷⢸⣿⣿⣿⣧⣿⡘⣿⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⠼⢠⡽⣿⣿⠇⣿⢸⣟⣾⢯⣾⣿⣿⣿⣿⣿⣷⡜⣯⣎⢻⣿⣿⣿⣿⡇⣿⡎⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡎⣿⢻⣿⣿⣸⡇⢿⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣧⢞⡻⣕⢸⢧⣿⣿⢸⣿⣿⣿⢄⢶⣯⣽⢿⣿⣿⣿⣿⣿⣌⢮⢒⠛⣛⡿⣿⢁⢿⣿⡼⣿⣿⣿⣷⣿⣿⣿⣿⣿⣧⢿⠘⣿⣿⣧⡇⠞⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣾⣾⠆⣤⠘⣷⢹⣿⢹⡇⣏⣿⣷⣾⣯⣼⣿⣿⣿⣿⣟⣑⣓⡙⢣⡉⠆⡟⣼⣦⣻⣧⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠸⡆⣿⣿⣿⢗⡖⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⢧⢫⣰⣿⢋⡇⣮⠘⠻⢞⢿⣷⣾⣻⣿⣿⣿⣿⣿⣿⣿⡿⢆⣙⡼⢀⠻⣛⡷⣻⣽⢻⣿⣿⣿⣿⣿⣿⣿⡏⢸⣿⣿⣽⣿⡘⡇⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⡟⣮⢿⡿⣿⣏⣧⠸⠀⢰⣀⢉⠒⠝⢣⣿⣿⣿⣿⣿⣿⣿⣡⣿⡑⠡⠤⠈⠊⠻⢷⠉⣾⡟⣽⣿⣿⣿⣿⢿⡇⡚⣩⣭⡭⠽⠷⠤⣭⡭⠭⣭⣭⡭⠭⢭⣝⢻${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⡇⣿⡇⢣⡏⣿⣝⡀⡇⣷⡹⣌⠳⠤⠌⢻⣿⣿⣿⣿⣿⣿⠟⠁⣀⠉⣉⠉⠉⡤⢠⡤⡀⣐⣿⣿⣻⣿⡿⣼⠃⣻⣭⣿⣶⣶⢳⣗⣶⣿⣿⣶⡶⣖⡴⣫⣴⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣧⢻⡇⢦⢏⢘⡟⣆⢻⢸⣿⣮⣯⣭⣿⣿⣿⣿⣿⣿⠟⡡⣢⣾⡻⣷⣽⣛⣛⡤⣃⣼⣳⣿⡿⣳⡟⣸⣧⣇⢺⣿⣿⣿⡿⣫⣿⠾⡟⣻⣭⡵⣺⣵⣾⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣄⢷⢸⣣⣣⡻⡿⣆⠃⠛⢿⣿⣿⣟⣽⣛⣿⣯⣴⣿⣿⣿⣿⣿⣿⣶⣶⠞⢈⡿⢡⣿⢿⣿⣟⢰⣟⡌⠀⣺⣿⠛⢉⣪⣥⣶⠿⢛⣭⣾⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡍⣷⠈⢤⠻⡙⣧⣳⣄⣭⣿⣸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⣥⢎⡾⣵⣿⣵⣿⠯⣲⡟⠍⢠⣶⣿⡭⠶⢟⣋⣭⣶⣿⣈⣝⣿⣿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣮⣇⠸⣦⠡⠈⠋⢿⣿⣿⣷⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠫⢋⠜⣿⣿⡟⡡⠚⠋⠐⠖⢀⡭⡥⣰⢸⣿⣿⣿⣿⣿⣧⡜⡝⢿⣿⣿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣟⡞⣴⡿⣱⢸⣆⢀⢹⣿⣿⣿⡿⠿⢿⣿⣿⣿⣿⣿⣿⣿⣵⡏⢊⣿⠟⣫⡔⢀⢀⣮⠎⢰⢟⢹⡇⡏⠏⣿⣿⡏⣿⣆⢻⡽⢘⣎⢻⡿⣿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⡺⣽⡿⡇⠊⣿⢏⣷⡝⢽⢿⣿⣯⣯⣿⣿⣿⣿⣿⣿⣿⣿⣿⡰⣚⣵⠿⢋⣴⣏⣜⣎⠆⢯⢧⣿⢸⣷⠂⢻⣿⣿⠘⣿⣕⠻⢯⠻⣆⠙⢿⣿⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣿⣿⣫⡾⢷⣿⣾⣿⣿⢏⣾⣿⢳⣷⡜⢽⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⢃⢉⣠⣾⣿⠏⢬⢮⠈⢶⡏⣸⣿⣼⣿⣜⡈⣿⣿⣧⢻⣿⣦⠮⡟⣗⡯⣎⠻⣿⣿${RESET}`,
  `${DIM}⣿⣿⣿⣿⣿⣿⣿⣻⠷⢋⢴⣿⢿⣿⡿⢣⣾⣿⢧⣹⣟⣽⣷⣅⠙⢿⣿⡿⠿⠛⣛⣭⠴⣺⠵⢿⣻⣭⢄⡠⡳⡃⣬⡎⡇⣿⣿⢿⣿⣿⣻⡘⣿⣿⡌⣿⣿⣧⣓⡝⣿⠎⢳⡜⢿${RESET}`,
  `${DIM}⣿⣿⣿⡿⣿⢽⣾⢵⣰⣫⡿⣵⣿⠟⣡⣿⣿⣳⣷⢯⣾⡏⣸⣟⡖⡂⠠⣤⣤⣤⣤⣶⣶⡾⠿⣻⡻⠁⢈⢊⣜⣼⡟⡄⣧⢿⣿⢸⡞⣿⣷⢷⣜⣿⣿⡘⣿⣿⣧⡈⠺⣧⡈⢿⣾${RESET}`,
  `${DIM}⣿⢟⠙⣈⣵⢟⣽⣿⣽⣫⣾⡿⡹⣵⣷⡿⣵⡟⣴⣿⠯⢖⣻⣼⡇⠙⣶⠶⠶⠶⡶⠶⣶⣿⡟⣫⢀⣴⣢⡟⣼⣿⣷⡇⢸⡾⣿⡇⡱⠘⣿⣎⣿⣮⢿⣷⡨⡿⣿⣷⣶⡔⢕⠸⣿${RESET}`,
  `${DIM}⣾⢦⣾⣿⣷⣽⢟⢞⣷⡿⡫⢔⣾⣿⢋⣞⣿⣿⠋⡅⠤⠾⠿⠶⠒⡇⣿⣿⣿⣿⣿⣿⡿⣫⢞⣵⡿⣷⠟⢴⣿⣿⣰⡾⢺⣇⠹⣇⠘⣅⢮⢿⡘⣿⣷⡻⣷⠑⣝⢿⣿⣿⡧⣳⣟${RESET}`,
  `${DIM}⣷⢿⡿⣻⡿⣫⣾⡿⣏⣺⣪⣿⠟⣡⣿⢏⣶⢿⣴⣾⢍⡩⢟⣟⣳⣀⠿⣿⣿⣿⡿⡯⡟⡵⢟⢛⣾⡯⣼⠊⢹⣿⠔⣰⡄⢿⡴⡽⡔⣤⠪⣓⠓⢝⣿⣿⣾⢷⣈⣷⡟⢿⣿⣿⣾${RESET}`,
  `${DIM}⣿⣿⣿⣻⡴⣟⣽⣿⡿⣵⢿⢕⣾⣽⣿⣟⣯⣽⣿⣷⣯⣾⡿⢡⣶⣽⣛⣿⡿⢯⣾⢋⣿⣟⣛⣿⣟⣵⣿⢰⢸⣿⣸⣿⣿⡜⣿⡴⣬⡌⠳⠬⡻⢷⡪⣿⣿⣿⣷⡷⣝⣿⣽⣿⣿${RESET}`,
];

// Layout constants
const MENU_WIDTH = 35;
const MENU_HEIGHT = 10;
const LOGO_WIDTH = 22;
const LOGO_HEIGHT = 6;
const PANEL_WIDTH = 45;
const PANEL_HEIGHT = 15;

interface MenuItem {
  label: string;
  action: () => Promise<void> | void;
}

let selectedIndex = 0;
let running = true;
let inSubmenu = false;

const cwd = process.cwd();
const critDir = join(cwd, ".crit");

function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

type LayoutMode = "wide" | "tall" | "logo-only" | "minimal";

function getLayoutMode(): LayoutMode {
  const { cols, rows } = getTerminalSize();

  // Wide: enough room for menu + panels side by side
  if (cols >= MENU_WIDTH + PANEL_WIDTH + 10 && rows >= PANEL_HEIGHT) {
    return "wide";
  }

  // Tall: enough room for menu + logo + panels stacked
  if (rows >= MENU_HEIGHT + LOGO_HEIGHT + PANEL_HEIGHT + 2 && cols >= PANEL_WIDTH) {
    return "tall";
  }

  // Logo only: enough room for menu + logo
  if (rows >= MENU_HEIGHT + LOGO_HEIGHT + 2 && cols >= LOGO_WIDTH + 5) {
    return "logo-only";
  }

  // Minimal: just the menu
  return "minimal";
}

async function showStatus(): Promise<void> {
  inSubmenu = true;
  process.stdout.write(CLEAR);

  console.log(`${BOLD}${CYAN}crit status${RESET}\n`);

  if (!existsSync(critDir)) {
    console.log(`${DIM}Not initialized. Select 'Start' to begin.${RESET}`);
  } else {
    const project = await loadProject(cwd);
    const summary = await getGoalsSummary(cwd);
    const pidFile = join(critDir, "daemon.pid");
    const daemonRunning = existsSync(pidFile);

    console.log(`Daemon: ${daemonRunning ? `${GREEN}running${RESET}` : `${DIM}stopped${RESET}`}\n`);

    console.log(`${BOLD}Goals${RESET} (${summary.total})`);
    if (project.goals.length === 0) {
      console.log(`  ${DIM}No goals yet${RESET}`);
    } else {
      for (const goal of project.goals) {
        const icon = goal.status === "done" ? `${GREEN}✓${RESET}` :
                     goal.status === "working" ? `${YELLOW}→${RESET}` :
                     goal.status === "partial" ? `${YELLOW}~${RESET}` :
                     goal.status === "broken" ? `${YELLOW}✗${RESET}` : `${DIM}○${RESET}`;
        console.log(`  ${icon} ${goal.text}`);
      }
    }

    console.log(`\n${BOLD}Rules${RESET} (${project.rules.length})`);
    if (project.rules.length === 0) {
      console.log(`  ${DIM}No rules yet${RESET}`);
    } else {
      for (const rule of project.rules) {
        console.log(`  ${DIM}•${RESET} ${rule.text}`);
      }
    }
  }

  console.log(`\n${DIM}Press any key to go back${RESET}`);

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  inSubmenu = false;
  render();
}

async function startDaemon(): Promise<void> {
  inSubmenu = true;
  process.stdout.write(CLEAR);
  console.log(`${BOLD}${CYAN}Starting crit...${RESET}\n`);

  const child = spawn("crit", ["start"], {
    detached: true,
    stdio: "ignore",
    cwd,
  });
  child.unref();

  console.log(`${GREEN}Daemon started in background${RESET}`);
  console.log(`\n${DIM}Press any key to go back${RESET}`);

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  inSubmenu = false;
  render();
}

async function stopDaemon(): Promise<void> {
  inSubmenu = true;
  process.stdout.write(CLEAR);
  console.log(`${BOLD}${CYAN}Stopping crit...${RESET}\n`);

  const { stop } = await import("../commands/stop");
  await stop();

  console.log(`\n${DIM}Press any key to go back${RESET}`);

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  inSubmenu = false;
  render();
}

async function editProject(): Promise<void> {
  const projectFile = join(critDir, "project.md");

  if (!existsSync(projectFile)) {
    inSubmenu = true;
    process.stdout.write(CLEAR);
    console.log(`${YELLOW}No project.md found. Start crit first.${RESET}`);
    console.log(`\n${DIM}Press any key to go back${RESET}`);
    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });
    inSubmenu = false;
    render();
    return;
  }

  // Prepare terminal for editor
  inSubmenu = true;
  process.stdout.write(SHOW_CURSOR);
  process.stdout.write(CLEAR);
  process.stdin.setRawMode(false);
  process.stdin.pause();

  const editor = process.env.EDITOR || "vim";
  const child = spawn(editor, [projectFile], {
    stdio: "inherit",
    cwd,
  });

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });

  // Restore TUI
  process.stdin.resume();
  process.stdin.setRawMode(true);
  process.stdout.write(HIDE_CURSOR);
  inSubmenu = false;
  render();
}

const menuItems: MenuItem[] = [
  { label: "Status", action: showStatus },
  { label: "Start", action: startDaemon },
  { label: "Stop", action: stopDaemon },
  { label: "Edit project.md", action: editProject },
  { label: "Quit", action: () => { running = false; } },
];

let showHelp = false;

// Refresh cached data from files
async function refreshData(): Promise<void> {
  try {
    cachedHistory = await getRecentHistory(cwd, 10);
  } catch {
    cachedHistory = [];
  }

  try {
    const project = await loadProject(cwd);
    cachedGoals = project.goals;
  } catch {
    cachedGoals = [];
  }
}

// Format timestamp for display
function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString();
}

// Get action icon
function getActionIcon(action: string): string {
  switch (action) {
    case "simplify": return `${GREEN}↓${RESET}`;
    case "fix": return `${YELLOW}⚡${RESET}`;
    case "update_docs": return `${BLUE}📝${RESET}`;
    case "apply_rule": return `${CYAN}◆${RESET}`;
    case "suggest": return `${MAGENTA}💡${RESET}`;
    default: return `${DIM}•${RESET}`;
  }
}

// Render Activity panel
function renderActivityPanel(width: number, height: number): string[] {
  const lines: string[] = [];
  lines.push(`${BOLD}${CYAN}Activity${RESET}`);
  lines.push(`${DIM}${"─".repeat(Math.min(width - 2, 40))}${RESET}`);

  if (cachedHistory.length === 0) {
    lines.push(`${DIM}No recent activity${RESET}`);
    lines.push(`${DIM}Start the daemon to${RESET}`);
    lines.push(`${DIM}see what crit is doing${RESET}`);
  } else {
    const maxEntries = Math.min(cachedHistory.length, height - 3);
    const recentEntries = cachedHistory.slice(-maxEntries).reverse();

    for (const entry of recentEntries) {
      const icon = getActionIcon(entry.action);
      const time = formatTime(entry.timestamp);
      const desc = entry.description.length > width - 15
        ? entry.description.slice(0, width - 18) + "..."
        : entry.description;
      lines.push(`${icon} ${desc}`);
      lines.push(`  ${DIM}${time}${RESET}`);
    }
  }

  return lines;
}

// Render Goals panel
function renderGoalsPanel(width: number, height: number): string[] {
  const lines: string[] = [];
  lines.push(`${BOLD}${GREEN}Goals${RESET}`);
  lines.push(`${DIM}${"─".repeat(Math.min(width - 2, 40))}${RESET}`);

  if (cachedGoals.length === 0) {
    lines.push(`${DIM}No goals defined${RESET}`);
    lines.push(`${DIM}Edit project.md to${RESET}`);
    lines.push(`${DIM}add your goals${RESET}`);
  } else {
    const maxGoals = Math.min(cachedGoals.length, height - 3);

    for (let i = 0; i < maxGoals; i++) {
      const goal = cachedGoals[i];
      const icon = goal.status === "done" ? `${GREEN}✓${RESET}` :
                   goal.status === "working" ? `${YELLOW}→${RESET}` :
                   goal.status === "partial" ? `${YELLOW}~${RESET}` :
                   goal.status === "broken" ? `${YELLOW}✗${RESET}` : `${DIM}○${RESET}`;
      const text = goal.text.length > width - 5
        ? goal.text.slice(0, width - 8) + "..."
        : goal.text;
      lines.push(`${icon} ${text}`);
    }

    if (cachedGoals.length > maxGoals) {
      lines.push(`${DIM}+${cachedGoals.length - maxGoals} more...${RESET}`);
    }
  }

  return lines;
}

function renderMenu(): string[] {
  const lines: string[] = [];
  lines.push(`${BOLD}${BLUE}crit${RESET} ${DIM}v0.1.0${RESET}`);
  lines.push("");

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    if (i === selectedIndex) {
      lines.push(`${CYAN}❯ ${BOLD}${item.label}${RESET}`);
    } else {
      lines.push(`  ${item.label}`);
    }
  }

  lines.push("");
  lines.push(`${DIM}? help${RESET}`);

  return lines;
}

function renderHelpPanel(): string[] {
  return [
    `${BOLD}Controls${RESET}`,
    ``,
    `${CYAN}j${RESET}/${CYAN}k${RESET} or ${CYAN}↑${RESET}/${CYAN}↓${RESET}  navigate`,
    `${CYAN}enter${RESET}        select`,
    `${CYAN}q${RESET}            quit`,
    `${CYAN}?${RESET}            toggle help`,
    ``,
    `${DIM}Press any key to close${RESET}`,
  ];
}

// Center a line horizontally
function centerLine(line: string, width: number): string {
  const textWidth = stripAnsi(line).length;
  const padding = Math.max(0, Math.floor((width - textWidth) / 2));
  return " ".repeat(padding) + line;
}

// Center an array of lines horizontally
function centerLines(lines: string[], width: number): string[] {
  return lines.map(line => centerLine(line, width));
}

function render(): void {
  if (inSubmenu) return;

  process.stdout.write(CLEAR);

  const { cols, rows } = getTerminalSize();

  // Show help overlay
  if (showHelp) {
    const helpLines = renderHelpPanel();
    const verticalPad = Math.max(0, Math.floor((rows - helpLines.length) / 2));

    for (let i = 0; i < verticalPad; i++) {
      console.log("");
    }
    for (const line of helpLines) {
      console.log(centerLine(line, cols));
    }
    return;
  }

  const layout = getLayoutMode();
  const menuLines = renderMenu();

  // Logo + menu combined for left side
  const leftContent = [...LOGO, "", ...menuLines];

  if (layout === "wide") {
    // Logo + menu top-left, Activity + Goals panels on the right
    const panelWidth = Math.min(50, cols - MENU_WIDTH - 8);
    const panelStartCol = MENU_WIDTH + 6;

    // Calculate panel heights - split available space
    const availableHeight = rows - 2;
    const activityHeight = Math.floor(availableHeight * 0.6);
    const goalsHeight = availableHeight - activityHeight - 1;

    const activityLines = renderActivityPanel(panelWidth, activityHeight);
    const goalsLines = renderGoalsPanel(panelWidth, goalsHeight);

    // Combine panels with a gap
    const rightContent = [...activityLines, "", ...goalsLines];

    const totalLines = Math.max(leftContent.length, rightContent.length);

    for (let i = 0; i < totalLines; i++) {
      let line = "";

      // Left content (logo + menu)
      if (i < leftContent.length) {
        line = leftContent[i];
      }

      // Right content (panels)
      const currentLen = stripAnsi(line).length;
      if (i < rightContent.length) {
        const rightLine = rightContent[i];
        line += " ".repeat(Math.max(1, panelStartCol - currentLen)) + rightLine;
      }

      console.log(line);
    }
  } else if (layout === "tall") {
    // Logo + menu top-left, then panels below
    for (const line of leftContent) {
      console.log(line);
    }
    console.log("");

    // Show panels side by side if room, or stacked if not
    const panelWidth = Math.min(45, Math.floor((cols - 4) / 2));
    const remainingHeight = rows - leftContent.length - 2;
    const panelHeight = Math.min(remainingHeight, 10);

    const activityLines = renderActivityPanel(panelWidth, panelHeight);
    const goalsLines = renderGoalsPanel(panelWidth, panelHeight);

    if (cols >= panelWidth * 2 + 6) {
      // Side by side
      const maxLines = Math.max(activityLines.length, goalsLines.length);
      for (let i = 0; i < maxLines; i++) {
        const left = i < activityLines.length ? activityLines[i] : "";
        const right = i < goalsLines.length ? goalsLines[i] : "";
        const leftPadded = left + " ".repeat(Math.max(1, panelWidth - stripAnsi(left).length + 2));
        console.log(leftPadded + right);
      }
    } else {
      // Stacked
      for (const line of activityLines) {
        console.log(line);
      }
      console.log("");
      for (const line of goalsLines) {
        console.log(line);
      }
    }
  } else if (layout === "logo-only") {
    // Just logo + menu, top-left
    for (const line of leftContent) {
      console.log(line);
    }
  } else {
    // Minimal: just menu, top-left (no logo)
    for (const line of menuLines) {
      console.log(line);
    }
  }
}

// Helper to strip ANSI codes for length calculation
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function handleKey(key: Buffer | string): void {
  const str = typeof key === "string" ? key : key.toString();

  // If help is showing, any key closes it
  if (showHelp) {
    showHelp = false;
    render();
    return;
  }

  if (str === "\x03" || str === "q") {
    running = false;
    return;
  }

  if (str === "?") {
    showHelp = true;
    render();
    return;
  }

  if (str === "j" || str === "\x1b[B") {
    selectedIndex = (selectedIndex + 1) % menuItems.length;
    render();
    return;
  }

  if (str === "k" || str === "\x1b[A") {
    selectedIndex = (selectedIndex - 1 + menuItems.length) % menuItems.length;
    render();
    return;
  }

  if (str === "\r" || str === "\n") {
    const item = menuItems[selectedIndex];
    item.action();
    return;
  }
}

// Set up file watchers for live updates
function setupWatchers(): void {
  const historyPath = join(critDir, "state", "history.jsonl");
  const projectPath = join(critDir, "project.md");

  // Watch history file
  if (existsSync(historyPath)) {
    try {
      historyWatcher = watch(historyPath, async () => {
        await refreshData();
        if (!inSubmenu && !showHelp) render();
      });
    } catch {
      // Ignore watch errors
    }
  }

  // Watch project file
  if (existsSync(projectPath)) {
    try {
      projectWatcher = watch(projectPath, async () => {
        await refreshData();
        if (!inSubmenu && !showHelp) render();
      });
    } catch {
      // Ignore watch errors
    }
  }

  // Also watch the state directory in case history file is created
  const stateDir = join(critDir, "state");
  if (existsSync(stateDir)) {
    try {
      watch(stateDir, async (_, filename) => {
        if (filename === "history.jsonl") {
          await refreshData();
          if (!inSubmenu && !showHelp) render();
        }
      });
    } catch {
      // Ignore watch errors
    }
  }
}

function cleanupWatchers(): void {
  if (historyWatcher) {
    historyWatcher.close();
    historyWatcher = null;
  }
  if (projectWatcher) {
    projectWatcher.close();
    projectWatcher = null;
  }
}

export async function tui(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log("TUI requires an interactive terminal.");
    console.log("Use 'crit --help' for command-line options.");
    process.exit(1);
  }

  // Load initial data
  await refreshData();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(HIDE_CURSOR);

  // Set up file watchers for live updates
  setupWatchers();

  // Re-render on terminal resize
  process.stdout.on("resize", () => {
    if (!inSubmenu) render();
  });

  render();

  process.stdin.on("data", async (key) => {
    if (inSubmenu) return;
    handleKey(key);

    if (!running) {
      cleanup();
    }
  });

  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 100);
  });
}

function cleanup(): void {
  cleanupWatchers();
  process.stdout.write(SHOW_CURSOR);
  process.stdout.write(CLEAR);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
