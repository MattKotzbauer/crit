import { join } from 'path';
import { Glob } from 'bun';
import type { ProjectAnalysis } from './types';

/**
 * Analyze a project to detect its type, structure, and dependencies
 */
export async function analyzeProject(projectPath: string): Promise<ProjectAnalysis> {
  const analysis: ProjectAnalysis = {
    type: 'unknown',
    entryPoints: [],
    mainDirs: [],
    dependencies: [],
  };

  // Check for different project types
  const [packageJson, pyprojectToml, cargoToml, goMod] = await Promise.all([
    readJsonFile(join(projectPath, 'package.json')),
    fileExists(join(projectPath, 'pyproject.toml')),
    fileExists(join(projectPath, 'Cargo.toml')),
    fileExists(join(projectPath, 'go.mod')),
  ]);

  // Detect project type
  if (packageJson) {
    // Check if it's Bun or Node
    const hasBunLock = await fileExists(join(projectPath, 'bun.lockb'));
    const hasBunLockText = await fileExists(join(projectPath, 'bun.lock'));
    analysis.type = hasBunLock || hasBunLockText ? 'bun' : 'node';
    analysis.packageName = packageJson.name;
    analysis.packageVersion = packageJson.version;

    // Extract dependencies
    if (packageJson.dependencies) {
      analysis.dependencies.push(...Object.keys(packageJson.dependencies));
    }
    if (packageJson.devDependencies) {
      analysis.dependencies.push(...Object.keys(packageJson.devDependencies));
    }

    // Detect entry points from package.json
    if (packageJson.main) {
      analysis.entryPoints.push(packageJson.main);
    }
    if (packageJson.module) {
      analysis.entryPoints.push(packageJson.module);
    }
    if (packageJson.bin) {
      if (typeof packageJson.bin === 'string') {
        analysis.entryPoints.push(packageJson.bin);
      } else {
        analysis.entryPoints.push(...Object.values(packageJson.bin));
      }
    }
  } else if (pyprojectToml) {
    analysis.type = 'python';
    // Could parse pyproject.toml for dependencies but keeping it simple
  } else if (cargoToml) {
    analysis.type = 'rust';
    // Could parse Cargo.toml for dependencies but keeping it simple
  } else if (goMod) {
    analysis.type = 'go';
  }

  // Find main directories
  const commonDirs = ['src', 'lib', 'app', 'packages', 'components', 'pages', 'routes'];
  for (const dir of commonDirs) {
    const dirPath = join(projectPath, dir);
    if (await dirExists(dirPath)) {
      analysis.mainDirs.push(dir);
    }
  }

  // Find common entry point files if none detected yet
  if (analysis.entryPoints.length === 0) {
    const commonEntryPoints = [
      'index.ts',
      'index.js',
      'main.ts',
      'main.js',
      'src/index.ts',
      'src/index.js',
      'src/main.ts',
      'src/main.js',
      'app.ts',
      'app.js',
    ];
    for (const entry of commonEntryPoints) {
      if (await fileExists(join(projectPath, entry))) {
        analysis.entryPoints.push(entry);
      }
    }
  }

  return analysis;
}

/**
 * Generate an architecture documentation file from analysis
 */
export function generateArchitectureDoc(analysis: ProjectAnalysis): string {
  const lines: string[] = [];

  lines.push('# Architecture');
  lines.push('');
  lines.push(`This is a **${analysis.type}** project.`);
  lines.push('');

  if (analysis.packageName) {
    lines.push(`**Package**: ${analysis.packageName}${analysis.packageVersion ? ` v${analysis.packageVersion}` : ''}`);
    lines.push('');
  }

  if (analysis.mainDirs.length > 0) {
    lines.push('## Directory Structure');
    lines.push('');
    for (const dir of analysis.mainDirs) {
      lines.push(`- \`${dir}/\``);
    }
    lines.push('');
  }

  if (analysis.entryPoints.length > 0) {
    lines.push('## Entry Points');
    lines.push('');
    for (const entry of analysis.entryPoints) {
      lines.push(`- \`${entry}\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Generate an implementation documentation file from analysis
 */
export function generateImplementationDoc(analysis: ProjectAnalysis): string {
  const lines: string[] = [];

  lines.push('# Implementation');
  lines.push('');
  lines.push('## Current State');
  lines.push('');
  lines.push('_Document the current implementation status here._');
  lines.push('');

  if (analysis.dependencies.length > 0) {
    lines.push('## Key Dependencies');
    lines.push('');
    // Show first 20 dependencies to avoid huge lists
    const deps = analysis.dependencies.slice(0, 20);
    for (const dep of deps) {
      lines.push(`- \`${dep}\``);
    }
    if (analysis.dependencies.length > 20) {
      lines.push(`- _...and ${analysis.dependencies.length - 20} more_`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('_Add implementation notes, decisions, and gotchas here._');
  lines.push('');

  return lines.join('\n');
}

/**
 * Get a quick summary of the project for LLM context
 */
export function getProjectSummary(analysis: ProjectAnalysis): string {
  const parts: string[] = [];

  parts.push(`${analysis.type} project`);

  if (analysis.packageName) {
    parts.push(`"${analysis.packageName}"`);
  }

  if (analysis.mainDirs.length > 0) {
    parts.push(`with ${analysis.mainDirs.join(', ')} directories`);
  }

  return parts.join(' ');
}

// Helper functions

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) {
      return null;
    }
    return await file.json();
  } catch {
    return null;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const file = Bun.file(path);
    return await file.exists();
  } catch {
    return false;
  }
}

async function dirExists(path: string): Promise<boolean> {
  try {
    const { existsSync, statSync } = await import('fs');
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
