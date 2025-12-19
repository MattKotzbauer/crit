/**
 * Issues Browser TUI - browse and act on criticisms
 *
 * Layout:
 * ┌─ ELIM ────────────┐  ┌────────────────────────────────────┐
 * │ > unused helper   │  │ src/lib/utils.ts:formatDate        │
 * │   dead export     │  │                                    │
 * ├─ SIMPLIFY ────────┤  │ This function is never called.     │
 * │   complex parser  │  │ Imported in 0 files.               │
 * ├─ TEST ────────────┤  │                                    │
 * │   auth flow       │  │ [a]ccept [r]eject [s]kip           │
 * └───────────────────┘  │ Reasoning: _______________         │
 */

import type { Criticism, CriticismCategory } from "../lib/criticism/types";
import { CATEGORY_ICONS, CATEGORY_COLORS } from "../lib/criticism/types";
import {
  loadCriticisms,
  updateCriticismStatus,
  getPendingCriticisms,
} from "../lib/criticism/store";
import { logAccepted, logRejected } from "../lib/criticism/preferences";

// ANSI codes
const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;
const YELLOW = `${ESC}[33m`;
const RED = `${ESC}[31m`;
const MAGENTA = `${ESC}[35m`;
const WHITE = `${ESC}[37m`;
const BG_DIM = `${ESC}[48;5;236m`;

const CLEAR = `${ESC}[2J${ESC}[H`;
const HIDE_CURSOR = `${ESC}[?25l`;
const SHOW_CURSOR = `${ESC}[?25h`;

// Layout constants
const LEFT_PANEL_WIDTH = 28;
const MIN_RIGHT_PANEL_WIDTH = 40;

interface IssuesState {
  criticisms: Criticism[];
  selectedIndex: number;
  scrollOffset: number;
  inputMode: "navigate" | "reasoning";
  reasoningBuffer: string;
  projectRoot: string;
}

let state: IssuesState = {
  criticisms: [],
  selectedIndex: 0,
  scrollOffset: 0,
  inputMode: "navigate",
  reasoningBuffer: "",
  projectRoot: process.cwd(),
};

// Callbacks for when user takes action
let onAccept: ((criticism: Criticism, reasoning?: string) => Promise<void>) | null = null;
let onReject: ((criticism: Criticism, reasoning?: string) => Promise<void>) | null = null;
let onExit: (() => void) | null = null;

function getTerminalSize(): { cols: number; rows: number } {
  return {
    cols: process.stdout.columns || 80,
    rows: process.stdout.rows || 24,
  };
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function truncate(str: string, maxLen: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= maxLen) return str;
  // Find position to cut, accounting for ANSI codes
  let visibleLen = 0;
  let cutPos = 0;
  for (let i = 0; i < str.length; i++) {
    if (str[i] === "\x1b") {
      // Skip ANSI sequence
      const endMatch = str.slice(i).match(/^\x1b\[[0-9;]*m/);
      if (endMatch) {
        i += endMatch[0].length - 1;
        continue;
      }
    }
    visibleLen++;
    if (visibleLen >= maxLen - 3) {
      cutPos = i + 1;
      break;
    }
  }
  return str.slice(0, cutPos) + "...";
}

function padRight(str: string, width: number): string {
  const stripped = stripAnsi(str);
  const padding = Math.max(0, width - stripped.length);
  return str + " ".repeat(padding);
}

// Group criticisms by category
function groupByCategory(criticisms: Criticism[]): Map<CriticismCategory, Criticism[]> {
  const groups = new Map<CriticismCategory, Criticism[]>();
  groups.set("ELIM", []);
  groups.set("SIMPLIFY", []);
  groups.set("TEST", []);

  for (const c of criticisms) {
    const group = groups.get(c.category)!;
    group.push(c);
  }

  return groups;
}

// Build flat list with category headers for navigation
interface ListItem {
  type: "header" | "criticism";
  category?: CriticismCategory;
  criticism?: Criticism;
}

function buildListItems(criticisms: Criticism[]): ListItem[] {
  const items: ListItem[] = [];
  const groups = groupByCategory(criticisms);

  for (const category of ["ELIM", "SIMPLIFY", "TEST"] as CriticismCategory[]) {
    const group = groups.get(category)!;
    if (group.length > 0) {
      items.push({ type: "header", category });
      for (const c of group) {
        items.push({ type: "criticism", criticism: c, category });
      }
    }
  }

  return items;
}

function renderLeftPanel(items: ListItem[], selectedIdx: number, height: number): string[] {
  const lines: string[] = [];
  const visibleItems = items.slice(state.scrollOffset, state.scrollOffset + height);

  for (let i = 0; i < visibleItems.length; i++) {
    const item = visibleItems[i];
    const globalIdx = state.scrollOffset + i;
    const isSelected = globalIdx === selectedIdx;

    if (item.type === "header") {
      const color = CATEGORY_COLORS[item.category!];
      const icon = CATEGORY_ICONS[item.category!];
      lines.push(`${color}${BOLD}─ ${icon} ${item.category} ${"─".repeat(LEFT_PANEL_WIDTH - item.category!.length - 6)}${RESET}`);
    } else {
      const prefix = isSelected ? `${CYAN}❯ ${RESET}` : "  ";
      const subject = truncate(item.criticism!.subject, LEFT_PANEL_WIDTH - 4);
      const bg = isSelected ? BG_DIM : "";
      lines.push(`${bg}${prefix}${subject}${RESET}`);
    }
  }

  // Pad to fill height
  while (lines.length < height) {
    lines.push("");
  }

  return lines;
}

function renderRightPanel(criticism: Criticism | null, width: number, height: number): string[] {
  const lines: string[] = [];

  if (!criticism) {
    lines.push(`${DIM}No criticism selected${RESET}`);
    lines.push("");
    lines.push(`${DIM}Use j/k to navigate${RESET}`);
  } else {
    // Header with location
    const color = CATEGORY_COLORS[criticism.category];
    const icon = CATEGORY_ICONS[criticism.category];
    lines.push(`${color}${BOLD}${icon} ${criticism.category}${RESET} ${DIM}│${RESET} ${criticism.location || criticism.files[0] || ""}`);
    lines.push(`${DIM}${"─".repeat(width - 2)}${RESET}`);
    lines.push("");

    // Subject
    lines.push(`${BOLD}${criticism.subject}${RESET}`);
    lines.push("");

    // Description - word wrap
    const descWords = criticism.description.split(" ");
    let currentLine = "";
    for (const word of descWords) {
      if (currentLine.length + word.length + 1 > width - 2) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = currentLine ? `${currentLine} ${word}` : word;
      }
    }
    if (currentLine) lines.push(currentLine);

    lines.push("");

    // Files affected
    if (criticism.files.length > 0) {
      lines.push(`${DIM}Files:${RESET}`);
      for (const file of criticism.files.slice(0, 3)) {
        lines.push(`  ${DIM}•${RESET} ${file}`);
      }
      if (criticism.files.length > 3) {
        lines.push(`  ${DIM}+${criticism.files.length - 3} more...${RESET}`);
      }
      lines.push("");
    }

    // Diff preview if available
    if (criticism.diff) {
      lines.push(`${DIM}Proposed change:${RESET}`);
      const diffLines = criticism.diff.split("\n").slice(0, 5);
      for (const dl of diffLines) {
        if (dl.startsWith("+")) {
          lines.push(`${GREEN}${dl}${RESET}`);
        } else if (dl.startsWith("-")) {
          lines.push(`${RED}${dl}${RESET}`);
        } else {
          lines.push(`${DIM}${dl}${RESET}`);
        }
      }
      lines.push("");
    }

    // Actions
    lines.push(`${DIM}${"─".repeat(width - 2)}${RESET}`);
    if (state.inputMode === "reasoning") {
      lines.push(`${YELLOW}Reasoning:${RESET} ${state.reasoningBuffer}█`);
      lines.push(`${DIM}Press Enter to confirm, Esc to cancel${RESET}`);
    } else {
      lines.push(`${GREEN}[a]${RESET}ccept  ${RED}[r]${RESET}eject  ${YELLOW}[s]${RESET}kip  ${DIM}[q]${RESET}back`);
      lines.push(`${DIM}Shift+A/R to add reasoning${RESET}`);
    }
  }

  // Pad to fill height
  while (lines.length < height) {
    lines.push("");
  }

  return lines.slice(0, height);
}

function render(): void {
  const { cols, rows } = getTerminalSize();
  const rightWidth = Math.max(MIN_RIGHT_PANEL_WIDTH, cols - LEFT_PANEL_WIDTH - 3);
  const panelHeight = rows - 2;

  const items = buildListItems(state.criticisms);

  // Get selected criticism
  let selectedCriticism: Criticism | null = null;
  if (items[state.selectedIndex]?.type === "criticism") {
    selectedCriticism = items[state.selectedIndex].criticism!;
  }

  const leftLines = renderLeftPanel(items, state.selectedIndex, panelHeight);
  const rightLines = renderRightPanel(selectedCriticism, rightWidth, panelHeight);

  process.stdout.write(CLEAR);

  // Title bar
  const title = `${BOLD}${MAGENTA}crit${RESET} ${DIM}Issues Browser${RESET}`;
  const count = `${state.criticisms.length} pending`;
  console.log(`${title}${" ".repeat(cols - stripAnsi(title).length - count.length)}${DIM}${count}${RESET}`);

  // Panels side by side
  for (let i = 0; i < panelHeight; i++) {
    const left = padRight(leftLines[i] || "", LEFT_PANEL_WIDTH);
    const divider = `${DIM}│${RESET}`;
    const right = rightLines[i] || "";
    console.log(`${left} ${divider} ${right}`);
  }
}

function findNextCriticism(direction: 1 | -1): number {
  const items = buildListItems(state.criticisms);
  let idx = state.selectedIndex;

  do {
    idx += direction;
    if (idx < 0) idx = items.length - 1;
    if (idx >= items.length) idx = 0;
    if (idx === state.selectedIndex) break; // Full loop
  } while (items[idx]?.type !== "criticism");

  return idx;
}

async function handleAccept(withReasoning: boolean): Promise<void> {
  const items = buildListItems(state.criticisms);
  if (items[state.selectedIndex]?.type !== "criticism") return;

  const criticism = items[state.selectedIndex].criticism!;

  if (withReasoning) {
    state.inputMode = "reasoning";
    state.reasoningBuffer = "";
    render();
  } else {
    // Update status
    updateCriticismStatus(state.projectRoot, criticism.id, "accepted");
    logAccepted(state.projectRoot, criticism);

    if (onAccept) {
      await onAccept(criticism);
    }

    // Remove from list and move selection
    state.criticisms = state.criticisms.filter(c => c.id !== criticism.id);
    if (state.selectedIndex >= buildListItems(state.criticisms).length) {
      state.selectedIndex = Math.max(0, buildListItems(state.criticisms).length - 1);
    }
    // Find next criticism
    state.selectedIndex = findNextCriticism(1);
    render();
  }
}

async function handleReject(withReasoning: boolean): Promise<void> {
  const items = buildListItems(state.criticisms);
  if (items[state.selectedIndex]?.type !== "criticism") return;

  const criticism = items[state.selectedIndex].criticism!;

  if (withReasoning) {
    state.inputMode = "reasoning";
    state.reasoningBuffer = "";
    render();
  } else {
    updateCriticismStatus(state.projectRoot, criticism.id, "rejected");
    logRejected(state.projectRoot, criticism);

    if (onReject) {
      await onReject(criticism);
    }

    state.criticisms = state.criticisms.filter(c => c.id !== criticism.id);
    state.selectedIndex = findNextCriticism(1);
    render();
  }
}

function handleSkip(): void {
  const items = buildListItems(state.criticisms);
  if (items[state.selectedIndex]?.type !== "criticism") return;

  const criticism = items[state.selectedIndex].criticism!;
  updateCriticismStatus(state.projectRoot, criticism.id, "skipped");

  state.criticisms = state.criticisms.filter(c => c.id !== criticism.id);
  state.selectedIndex = findNextCriticism(1);
  render();
}

async function confirmReasoning(action: "accept" | "reject"): Promise<void> {
  const items = buildListItems(state.criticisms);
  if (items[state.selectedIndex]?.type !== "criticism") return;

  const criticism = items[state.selectedIndex].criticism!;
  criticism.reasoning = state.reasoningBuffer;

  if (action === "accept") {
    updateCriticismStatus(state.projectRoot, criticism.id, "accepted", state.reasoningBuffer);
    logAccepted(state.projectRoot, criticism);
    if (onAccept) await onAccept(criticism, state.reasoningBuffer);
  } else {
    updateCriticismStatus(state.projectRoot, criticism.id, "rejected", state.reasoningBuffer);
    logRejected(state.projectRoot, criticism);
    if (onReject) await onReject(criticism, state.reasoningBuffer);
  }

  state.criticisms = state.criticisms.filter(c => c.id !== criticism.id);
  state.selectedIndex = findNextCriticism(1);
  state.inputMode = "navigate";
  state.reasoningBuffer = "";
  render();
}

let pendingAction: "accept" | "reject" | null = null;

function handleKey(key: Buffer | string): void {
  const str = typeof key === "string" ? key : key.toString();

  if (state.inputMode === "reasoning") {
    if (str === "\x1b" || str === "\x03") {
      // Escape or Ctrl+C - cancel reasoning
      state.inputMode = "navigate";
      state.reasoningBuffer = "";
      pendingAction = null;
      render();
    } else if (str === "\r" || str === "\n") {
      // Enter - confirm
      if (pendingAction) {
        confirmReasoning(pendingAction);
        pendingAction = null;
      }
    } else if (str === "\x7f" || str === "\b") {
      // Backspace
      state.reasoningBuffer = state.reasoningBuffer.slice(0, -1);
      render();
    } else if (str.length === 1 && str.charCodeAt(0) >= 32) {
      // Printable character
      state.reasoningBuffer += str;
      render();
    }
    return;
  }

  // Navigation mode
  if (str === "\x03" || str === "q") {
    if (onExit) onExit();
    return;
  }

  if (str === "j" || str === "\x1b[B") {
    state.selectedIndex = findNextCriticism(1);
    // Scroll if needed
    const items = buildListItems(state.criticisms);
    const { rows } = getTerminalSize();
    const panelHeight = rows - 2;
    if (state.selectedIndex >= state.scrollOffset + panelHeight - 1) {
      state.scrollOffset = Math.min(items.length - panelHeight, state.selectedIndex - panelHeight + 2);
    }
    render();
    return;
  }

  if (str === "k" || str === "\x1b[A") {
    state.selectedIndex = findNextCriticism(-1);
    if (state.selectedIndex < state.scrollOffset) {
      state.scrollOffset = state.selectedIndex;
    }
    render();
    return;
  }

  if (str === "a") {
    handleAccept(false);
    return;
  }

  if (str === "A") {
    pendingAction = "accept";
    handleAccept(true);
    return;
  }

  if (str === "r") {
    handleReject(false);
    return;
  }

  if (str === "R") {
    pendingAction = "reject";
    handleReject(true);
    return;
  }

  if (str === "s") {
    handleSkip();
    return;
  }
}

export interface IssuesBrowserOptions {
  projectRoot?: string;
  onAccept?: (criticism: Criticism, reasoning?: string) => Promise<void>;
  onReject?: (criticism: Criticism, reasoning?: string) => Promise<void>;
  onExit?: () => void;
}

export async function showIssuesBrowser(options: IssuesBrowserOptions = {}): Promise<void> {
  state.projectRoot = options.projectRoot || process.cwd();
  state.criticisms = getPendingCriticisms(state.projectRoot);
  state.selectedIndex = 0;
  state.scrollOffset = 0;
  state.inputMode = "navigate";
  state.reasoningBuffer = "";

  onAccept = options.onAccept || null;
  onReject = options.onReject || null;
  onExit = options.onExit || null;

  // Find first criticism (skip headers)
  const items = buildListItems(state.criticisms);
  for (let i = 0; i < items.length; i++) {
    if (items[i].type === "criticism") {
      state.selectedIndex = i;
      break;
    }
  }

  if (!process.stdin.isTTY) {
    console.log("Issues browser requires an interactive terminal.");
    return;
  }

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdout.write(HIDE_CURSOR);

  render();

  return new Promise((resolve) => {
    const originalExit = onExit;
    onExit = () => {
      process.stdout.write(SHOW_CURSOR);
      process.stdin.setRawMode(false);
      process.stdin.removeListener("data", handleKey);
      if (originalExit) originalExit();
      resolve();
    };

    process.stdin.on("data", handleKey);
  });
}

