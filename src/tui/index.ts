/**
 * crit TUI - lazygit-style interface
 *
 * Navigate with hjkl or arrows, enter to select, q to quit
 */

import { getRecentHistory } from "../lib/state/history";
import type { HistoryEntry } from "../lib/state/types";
import { existsSync, watch, mkdirSync, type FSWatcher } from "fs";
import { join } from "path";
import { showIssuesBrowser } from "./issues";
import { getPendingCriticisms } from "../lib/criticism/store";
import { startDaemon as startCritDaemon, type DaemonHandle } from "../daemon";
import { analyzeProject } from "../daemon/analyzer";
import { initPreferences } from "../lib/criticism/preferences";
import { initStatus } from "../lib/criticism/status";
import { getQueueSize } from "../lib/analysis/queue";

// Cached data for panels
let cachedHistory: HistoryEntry[] = [];
let historyWatcher: FSWatcher | null = null;
let projectWatcher: FSWatcher | null = null;
let daemonHandle: DaemonHandle | null = null;
let analysisQueueSize = 0;

// ANSI escape codes
const ESC = "\x1b";
const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;
const RED = `${ESC}[31m`;
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

  // Daemon status - if TUI is running, daemon is running
  const daemonRunning = daemonHandle !== null;
  console.log(`Daemon: ${daemonRunning ? `${GREEN}running${RESET}` : `${DIM}stopped${RESET}`}\n`);

  // Issues count
  const issueCount = getPendingCriticisms(cwd).length;
  console.log(`${BOLD}Issues${RESET}: ${issueCount > 0 ? `${YELLOW}${issueCount} pending${RESET}` : `${DIM}none${RESET}`}`);

  // Analysis queue
  const queueSize = getQueueSize(cwd);
  console.log(`${BOLD}Analysis Queue${RESET}: ${queueSize > 0 ? `${CYAN}${queueSize} files${RESET}` : `${DIM}empty${RESET}`}\n`);

  // Load status from status.md
  const { parseStatus } = await import("../lib/criticism/status");
  const status = parseStatus(cwd);

  // Deliverables
  console.log(`${BOLD}Deliverables${RESET} (${status.deliverables.length})`);
  if (status.deliverables.length === 0) {
    console.log(`  ${DIM}None tracked yet${RESET}`);
  } else {
    for (const d of status.deliverables) {
      const icon = d.done ? `${GREEN}✓${RESET}` : d.inProgress ? `${YELLOW}→${RESET}` : `${DIM}○${RESET}`;
      console.log(`  ${icon} ${d.name}`);
    }
  }

  // Insights
  console.log(`\n${BOLD}Insights${RESET} (${status.insights.length})`);
  if (status.insights.length === 0) {
    console.log(`  ${DIM}None recorded yet${RESET}`);
  } else {
    for (const insight of status.insights) {
      console.log(`  ${DIM}•${RESET} ${insight}`);
    }
  }

  // Current focus
  if (status.currentFocus) {
    console.log(`\n${BOLD}Current Focus${RESET}`);
    console.log(`  ${status.currentFocus}`);
  }

  // Preferences stats
  const { parsePreferences } = await import("../lib/criticism/preferences");
  const prefs = parsePreferences(cwd);
  const accepted = prefs.filter(p => p.decision === "accepted").length;
  const rejected = prefs.filter(p => p.decision === "rejected").length;

  if (accepted > 0 || rejected > 0) {
    console.log(`\n${BOLD}Decisions${RESET}`);
    console.log(`  ${GREEN}${accepted}${RESET} accepted, ${DIM}${rejected}${RESET} rejected`);
  }

  console.log(`\n${DIM}Press any key to go back${RESET}`);

  await new Promise<void>((resolve) => {
    process.stdin.once("data", () => resolve());
  });

  inSubmenu = false;
  render();
}

// Removed: startDaemon, stopDaemon, editProject - daemon auto-manages with TUI

async function showIssues(): Promise<void> {
  const pendingCount = getPendingCriticisms(cwd).length;

  if (pendingCount === 0) {
    inSubmenu = true;
    process.stdout.write(CLEAR);
    console.log(`${BOLD}${CYAN}Issues${RESET}\n`);
    console.log(`${DIM}No pending issues.${RESET}`);
    console.log(`${DIM}The daemon will analyze changes and generate issues.${RESET}`);
    console.log(`\n${DIM}Press any key to go back${RESET}`);

    await new Promise<void>((resolve) => {
      process.stdin.once("data", () => resolve());
    });

    inSubmenu = false;
    render();
    return;
  }

  // Temporarily exit TUI mode for issues browser
  cleanupWatchers();
  process.stdin.removeAllListeners("data");

  await showIssuesBrowser({
    projectRoot: cwd,
    onAccept: async (_criticism, _reasoning) => {
      // Diff application happens in issues.ts via logAccepted
    },
    onReject: async (_criticism, _reasoning) => {
      // Rejection logging happens in issues.ts via logRejected
    },
    onExit: () => {
      // Will be handled by promise resolution
    },
  });

  // Restore main TUI - must re-enable raw mode!
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(HIDE_CURSOR);
  setupWatchers();
  await refreshData();
  process.stdin.on("data", async (key) => {
    if (inSubmenu) return;
    handleKey(key);
    if (!running) {
      cleanup();
    }
  });
  render();
}

const menuItems: MenuItem[] = [
  { label: "Issues", action: showIssues },
  { label: "Status", action: showStatus },
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

// Render Issues panel
function renderIssuesPanel(width: number, height: number): string[] {
  const lines: string[] = [];
  const criticisms = getPendingCriticisms(cwd);
  const queueSize = getQueueSize(cwd);

  // Title with queue indicator
  const queueIndicator = queueSize > 0 ? ` ${DIM}(${queueSize} queued)${RESET}` : "";
  lines.push(`${BOLD}${YELLOW}Issues${RESET}${queueIndicator}`);
  lines.push(`${DIM}${"─".repeat(Math.min(width - 2, 40))}${RESET}`);

  if (criticisms.length === 0) {
    if (queueSize > 0) {
      lines.push(`${DIM}No issues yet${RESET}`);
      lines.push(`${CYAN}${queueSize} files${RESET} queued`);
      lines.push(`${DIM}for deep analysis${RESET}`);
    } else {
      lines.push(`${DIM}No pending issues${RESET}`);
      lines.push(`${DIM}Daemon is watching${RESET}`);
      lines.push(`${DIM}for changes...${RESET}`);
    }
  } else {
    const maxIssues = Math.min(criticisms.length, height - 3);

    for (let i = 0; i < maxIssues; i++) {
      const c = criticisms[i];
      const icon = c.category === "ELIM" ? `${RED}✗${RESET}` :
                   c.category === "SIMPLIFY" ? `${YELLOW}↓${RESET}` :
                   `${CYAN}◆${RESET}`;
      const text = c.subject.length > width - 5
        ? c.subject.slice(0, width - 8) + "..."
        : c.subject;
      lines.push(`${icon} ${text}`);
    }

    if (criticisms.length > maxIssues) {
      lines.push(`${DIM}+${criticisms.length - maxIssues} more...${RESET}`);
    }
  }

  return lines;
}

function renderMenu(): string[] {
  const lines: string[] = [];
  lines.push(`${BOLD}${BLUE}crit${RESET} ${DIM}v0.1.0${RESET}`);
  lines.push("");

  // Get current issue count
  const currentIssueCount = getPendingCriticisms(cwd).length;

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    let label = item.label;

    // Add issue count badge to Issues menu item
    if (item.label === "Issues" && currentIssueCount > 0) {
      label = `${item.label} ${YELLOW}(${currentIssueCount})${RESET}`;
    }

    if (i === selectedIndex) {
      lines.push(`${CYAN}❯ ${BOLD}${label}${RESET}`);
    } else {
      lines.push(`  ${label}`);
    }
  }

  lines.push("");
  lines.push(`${DIM}? help${RESET}`);

  return lines;
}

// Draw a floating box overlay at a position
function drawOverlay(lines: string[], startRow: number, startCol: number): void {
  const maxWidth = Math.max(...lines.map(l => stripAnsi(l).length));
  const boxWidth = maxWidth + 4;
  const boxHeight = lines.length + 2;

  // ANSI escape for positioning: ESC[row;colH
  const moveTo = (row: number, col: number) => `${ESC}[${row};${col}H`;

  // Draw top border
  process.stdout.write(moveTo(startRow, startCol));
  process.stdout.write(`${DIM}┌${"─".repeat(boxWidth - 2)}┐${RESET}`);

  // Draw content lines with side borders
  for (let i = 0; i < lines.length; i++) {
    process.stdout.write(moveTo(startRow + 1 + i, startCol));
    const line = lines[i];
    const padding = maxWidth - stripAnsi(line).length;
    process.stdout.write(`${DIM}│${RESET} ${line}${" ".repeat(padding)} ${DIM}│${RESET}`);
  }

  // Draw bottom border
  process.stdout.write(moveTo(startRow + boxHeight - 1, startCol));
  process.stdout.write(`${DIM}└${"─".repeat(boxWidth - 2)}┘${RESET}`);

  // Move cursor to bottom
  process.stdout.write(moveTo(startRow + boxHeight, 1));
}

function renderHelpContent(): string[] {
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
    const issuesLines = renderIssuesPanel(panelWidth, goalsHeight);

    // Combine panels with a gap
    const rightContent = [...activityLines, "", ...issuesLines];

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
    const issuesLines = renderIssuesPanel(panelWidth, panelHeight);

    if (cols >= panelWidth * 2 + 6) {
      // Side by side
      const maxLines = Math.max(activityLines.length, issuesLines.length);
      for (let i = 0; i < maxLines; i++) {
        const left = i < activityLines.length ? activityLines[i] : "";
        const right = i < issuesLines.length ? issuesLines[i] : "";
        const leftPadded = left + " ".repeat(Math.max(1, panelWidth - stripAnsi(left).length + 2));
        console.log(leftPadded + right);
      }
    } else {
      // Stacked
      for (const line of activityLines) {
        console.log(line);
      }
      console.log("");
      for (const line of issuesLines) {
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

  // Draw help overlay on top if showing
  if (showHelp) {
    const helpLines = renderHelpContent();
    const helpHeight = helpLines.length + 2;
    const helpWidth = Math.max(...helpLines.map(l => stripAnsi(l).length)) + 4;

    // Center the overlay
    const startRow = Math.max(1, Math.floor((rows - helpHeight) / 2));
    const startCol = Math.max(1, Math.floor((cols - helpWidth) / 2));

    drawOverlay(helpLines, startRow, startCol);
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

  // Initialize .crit directory if needed
  if (!existsSync(critDir)) {
    mkdirSync(critDir, { recursive: true });
    mkdirSync(join(critDir, "state"), { recursive: true });
    mkdirSync(join(critDir, "context"), { recursive: true });
  }

  // Initialize context files
  initPreferences(cwd);
  initStatus(cwd);

  // Load initial data
  await refreshData();

  // Cold-start analysis if no existing criticisms
  const existingCriticisms = getPendingCriticisms(cwd);
  if (existingCriticisms.length === 0) {
    // Run initial project analysis in background
    analyzeProject(cwd).catch(() => {
      // Ignore analysis errors
    });
  }

  // Start daemon automatically
  try {
    analysisQueueSize = getQueueSize(cwd);
    daemonHandle = await startCritDaemon(cwd, {
      onCriticisms: () => {
        if (!inSubmenu && !showHelp) render();
      },
      onQueueUpdate: (size) => {
        analysisQueueSize = size;
        if (!inSubmenu && !showHelp) render();
      },
      writeHistory: true,
      writeReports: true,
      analyzeCriticisms: true,
      queueForDeepAnalysis: true,
    });
  } catch {
    // Ignore daemon start errors
  }

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
  // Stop daemon
  if (daemonHandle) {
    daemonHandle.stop();
    daemonHandle = null;
  }

  cleanupWatchers();
  process.stdout.write(SHOW_CURSOR);
  process.stdout.write(CLEAR);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
