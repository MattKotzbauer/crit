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
const ANIME_WIDTH = 80;
const ANIME_HEIGHT = 24;

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

  // Wide: enough room for menu + anime side by side
  if (cols >= MENU_WIDTH + ANIME_WIDTH + 5 && rows >= ANIME_HEIGHT) {
    return "wide";
  }

  // Tall: enough room for menu + logo + anime stacked
  if (rows >= MENU_HEIGHT + LOGO_HEIGHT + ANIME_HEIGHT + 2 && cols >= ANIME_WIDTH) {
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
    // Logo + menu top-left, anime on right side vertically centered
    const animeVerticalPad = Math.max(0, Math.floor((rows - ANIME.length) / 2));
    const animeHorizontalPad = Math.max(MENU_WIDTH + 4, cols - ANIME_WIDTH - 2);

    const totalLines = Math.max(leftContent.length, animeVerticalPad + ANIME.length);

    for (let i = 0; i < totalLines; i++) {
      let line = "";

      // Left content (logo + menu)
      if (i < leftContent.length) {
        line = leftContent[i];
      }

      // Anime on right, vertically centered
      const currentLen = stripAnsi(line).length;
      if (i >= animeVerticalPad && i < animeVerticalPad + ANIME.length) {
        const animeLine = ANIME[i - animeVerticalPad];
        line += " ".repeat(Math.max(1, animeHorizontalPad - currentLen)) + animeLine;
      }

      console.log(line);
    }
  } else if (layout === "tall") {
    // Logo + menu top-left, then anime centered below
    for (const line of leftContent) {
      console.log(line);
    }
    console.log("");

    for (const line of ANIME) {
      console.log(centerLine(line, cols));
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

function handleKey(key: Buffer): void {
  const str = key.toString();

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

export async function tui(): Promise<void> {
  if (!process.stdin.isTTY) {
    console.log("TUI requires an interactive terminal.");
    console.log("Use 'crit --help' for command-line options.");
    process.exit(1);
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(HIDE_CURSOR);

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
  process.stdout.write(SHOW_CURSOR);
  process.stdout.write(CLEAR);
  process.stdin.setRawMode(false);
  process.stdin.pause();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
