/**
 * crit TUI - lazygit-style interface
 *
 * Navigate with hjkl or arrows, enter to select, q to quit
 */

import { loadProject, getGoalsSummary } from "../lib/project";
import { existsSync } from "fs";
import { join } from "path";
import { spawn } from "child_process";

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

interface MenuItem {
  label: string;
  action: () => Promise<void> | void;
}

let selectedIndex = 0;
let running = true;
let inSubmenu = false;

const cwd = process.cwd();
const critDir = join(cwd, ".crit");

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

  // Wait for keypress
  await new Promise<void>((resolve) => {
    const onData = () => {
      process.stdin.off("data", onData);
      resolve();
    };
    process.stdin.once("data", onData);
  });

  inSubmenu = false;
}

async function startDaemon(): Promise<void> {
  inSubmenu = true;
  process.stdout.write(CLEAR);
  console.log(`${BOLD}${CYAN}Starting crit...${RESET}\n`);

  // Run crit start in background
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
    return;
  }

  // Restore terminal state before opening editor
  process.stdout.write(SHOW_CURSOR);
  process.stdin.setRawMode(false);

  const editor = process.env.EDITOR || "vim";
  const child = spawn(editor, [projectFile], {
    stdio: "inherit",
    cwd,
  });

  await new Promise<void>((resolve) => {
    child.on("close", () => resolve());
  });

  // Restore TUI mode
  process.stdin.setRawMode(true);
  process.stdout.write(HIDE_CURSOR);
}

const menuItems: MenuItem[] = [
  { label: "Status", action: showStatus },
  { label: "Start", action: startDaemon },
  { label: "Stop", action: stopDaemon },
  { label: "Edit project.md", action: editProject },
  { label: "Quit", action: () => { running = false; } },
];

function render(): void {
  if (inSubmenu) return;

  process.stdout.write(CLEAR);

  console.log(`${BOLD}${BLUE}crit${RESET} ${DIM}v0.1.0${RESET}\n`);
  console.log(`${DIM}Navigate: j/k or ↑/↓  Select: Enter  Quit: q${RESET}\n`);

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    if (i === selectedIndex) {
      console.log(`${CYAN}❯ ${BOLD}${item.label}${RESET}`);
    } else {
      console.log(`  ${item.label}`);
    }
  }
}

function handleKey(key: Buffer): void {
  const str = key.toString();

  // Ctrl+C or q to quit
  if (str === "\x03" || str === "q") {
    running = false;
    return;
  }

  // j or down arrow
  if (str === "j" || str === "\x1b[B") {
    selectedIndex = (selectedIndex + 1) % menuItems.length;
    render();
    return;
  }

  // k or up arrow
  if (str === "k" || str === "\x1b[A") {
    selectedIndex = (selectedIndex - 1 + menuItems.length) % menuItems.length;
    render();
    return;
  }

  // Enter
  if (str === "\r" || str === "\n") {
    const item = menuItems[selectedIndex];
    item.action();
    return;
  }
}

export async function tui(): Promise<void> {
  // Check if we're in a TTY
  if (!process.stdin.isTTY) {
    console.log("TUI requires an interactive terminal.");
    console.log("Use 'crit --help' for command-line options.");
    process.exit(1);
  }

  // Setup terminal
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(HIDE_CURSOR);

  // Initial render
  render();

  // Handle input
  process.stdin.on("data", async (key) => {
    if (inSubmenu) return;
    handleKey(key);

    if (!running) {
      cleanup();
    }
  });

  // Wait until quit
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
  process.stdout.write(SHOW_CURSOR);
  process.stdout.write(CLEAR);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

// Handle unexpected exit
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
