import { join } from 'path';
import { Glob } from 'bun';
import type { ContextFile } from './types';

const CONTEXT_DIR = '.crit/context';

/**
 * Load all context files from a project
 */
export async function loadContext(projectPath: string): Promise<ContextFile[]> {
  const contextDir = join(projectPath, CONTEXT_DIR);
  const files: ContextFile[] = [];

  try {
    const glob = new Glob('*.md');
    for await (const file of glob.scan({ cwd: contextDir, absolute: false })) {
      const filePath = join(contextDir, file);
      const content = await Bun.file(filePath).text();
      files.push({
        name: file,
        path: filePath,
        content,
      });
    }
  } catch (error) {
    // Context directory doesn't exist yet, return empty array
    return [];
  }

  return files;
}

/**
 * Get a specific context file by name
 */
export async function getContextFile(
  projectPath: string,
  name: string
): Promise<ContextFile | null> {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = join(projectPath, CONTEXT_DIR, fileName);

  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return null;
    }
    const content = await file.text();
    return {
      name: fileName,
      path: filePath,
      content,
    };
  } catch {
    return null;
  }
}

/**
 * Save a context file
 */
export async function saveContextFile(
  projectPath: string,
  name: string,
  content: string
): Promise<void> {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const contextDir = join(projectPath, CONTEXT_DIR);
  const filePath = join(contextDir, fileName);

  // Ensure directory exists
  await Bun.write(filePath, content);
}

/**
 * List all context file names
 */
export async function listContextFiles(projectPath: string): Promise<string[]> {
  const contextDir = join(projectPath, CONTEXT_DIR);
  const files: string[] = [];

  try {
    const glob = new Glob('*.md');
    for await (const file of glob.scan({ cwd: contextDir, absolute: false })) {
      files.push(file);
    }
  } catch {
    return [];
  }

  return files;
}

/**
 * Delete a context file
 */
export async function deleteContextFile(
  projectPath: string,
  name: string
): Promise<boolean> {
  const fileName = name.endsWith('.md') ? name : `${name}.md`;
  const filePath = join(projectPath, CONTEXT_DIR, fileName);

  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return false;
    }
    await Bun.write(filePath, ''); // Clear file first
    const { unlinkSync } = await import('fs');
    unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format context files for LLM consumption
 */
export function formatForLLM(files: ContextFile[]): string {
  if (files.length === 0) {
    return '';
  }

  const sections = files.map((file) => {
    const title = file.name.replace('.md', '');
    return `## ${title}\n\n${file.content}`;
  });

  return sections.join('\n\n---\n\n');
}

/**
 * Ensure the context directory exists
 */
export async function ensureContextDir(projectPath: string): Promise<void> {
  const contextDir = join(projectPath, CONTEXT_DIR);
  const { mkdirSync, existsSync } = await import('fs');
  if (!existsSync(contextDir)) {
    mkdirSync(contextDir, { recursive: true });
  }
}
