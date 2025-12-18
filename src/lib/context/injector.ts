import { join } from 'path';
import type { InjectionResult } from './types';

const CLAUDE_MD_PATH = '.claude/CLAUDE.md';
const START_MARKER = '<!-- CRIT:START -->';
const END_MARKER = '<!-- CRIT:END -->';

/**
 * Inject content into .claude/CLAUDE.md within crit markers
 */
export async function injectIntoClaudeMd(
  projectPath: string,
  content: string
): Promise<InjectionResult> {
  const filePath = join(projectPath, CLAUDE_MD_PATH);
  const file = Bun.file(filePath);
  const exists = await file.exists();

  const wrappedContent = formatCritSection(content);

  if (!exists) {
    // Create new file with just the crit section
    await ensureClaudeDir(projectPath);
    await Bun.write(filePath, wrappedContent);
    return {
      success: true,
      filePath,
      created: true,
    };
  }

  // Read existing content
  const existingContent = await file.text();

  // Check if markers already exist
  const hasMarkers = existingContent.includes(START_MARKER);

  let newContent: string;
  if (hasMarkers) {
    // Replace existing section
    newContent = replaceSection(existingContent, wrappedContent);
  } else {
    // Append to end of file
    newContent = existingContent.trimEnd() + '\n\n' + wrappedContent;
  }

  await Bun.write(filePath, newContent);
  return {
    success: true,
    filePath,
    created: false,
  };
}

/**
 * Remove crit section from .claude/CLAUDE.md
 */
export async function removeFromClaudeMd(projectPath: string): Promise<boolean> {
  const filePath = join(projectPath, CLAUDE_MD_PATH);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return false;
  }

  const content = await file.text();
  if (!content.includes(START_MARKER)) {
    return false;
  }

  const newContent = removeSection(content);
  await Bun.write(filePath, newContent);
  return true;
}

/**
 * Update the crit section in .claude/CLAUDE.md (alias for inject)
 */
export async function updateClaudeMdSection(
  projectPath: string,
  content: string
): Promise<InjectionResult> {
  return injectIntoClaudeMd(projectPath, content);
}

/**
 * Check if CLAUDE.md has a crit section
 */
export async function hasCritSection(projectPath: string): Promise<boolean> {
  const filePath = join(projectPath, CLAUDE_MD_PATH);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return false;
  }

  const content = await file.text();
  return content.includes(START_MARKER) && content.includes(END_MARKER);
}

/**
 * Get the current crit section content (without markers)
 */
export async function getCritSection(projectPath: string): Promise<string | null> {
  const filePath = join(projectPath, CLAUDE_MD_PATH);
  const file = Bun.file(filePath);

  if (!(await file.exists())) {
    return null;
  }

  const content = await file.text();
  return extractSection(content);
}

// Helper functions

function formatCritSection(content: string): string {
  return `${START_MARKER}
## Crit Context

${content.trim()}

${END_MARKER}`;
}

function replaceSection(fileContent: string, newSection: string): string {
  const startIndex = fileContent.indexOf(START_MARKER);
  const endIndex = fileContent.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    return fileContent;
  }

  const before = fileContent.substring(0, startIndex).trimEnd();
  const after = fileContent.substring(endIndex + END_MARKER.length).trimStart();

  if (before && after) {
    return before + '\n\n' + newSection + '\n\n' + after;
  } else if (before) {
    return before + '\n\n' + newSection;
  } else if (after) {
    return newSection + '\n\n' + after;
  }
  return newSection;
}

function removeSection(fileContent: string): string {
  const startIndex = fileContent.indexOf(START_MARKER);
  const endIndex = fileContent.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    return fileContent;
  }

  const before = fileContent.substring(0, startIndex).trimEnd();
  const after = fileContent.substring(endIndex + END_MARKER.length).trimStart();

  if (before && after) {
    return before + '\n\n' + after;
  } else if (before) {
    return before;
  } else if (after) {
    return after;
  }
  return '';
}

function extractSection(fileContent: string): string | null {
  const startIndex = fileContent.indexOf(START_MARKER);
  const endIndex = fileContent.indexOf(END_MARKER);

  if (startIndex === -1 || endIndex === -1) {
    return null;
  }

  const sectionContent = fileContent.substring(
    startIndex + START_MARKER.length,
    endIndex
  );

  // Remove the "## Crit Context" header if present
  const lines = sectionContent.trim().split('\n');
  if (lines[0]?.startsWith('## Crit Context')) {
    lines.shift();
  }

  return lines.join('\n').trim();
}

async function ensureClaudeDir(projectPath: string): Promise<void> {
  const { mkdirSync, existsSync } = await import('fs');
  const claudeDir = join(projectPath, '.claude');
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }
}
