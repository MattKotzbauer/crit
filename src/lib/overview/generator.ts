import { join, relative, basename } from 'path';
import type { ProjectOverview, ModuleInfo, FeatureStatus } from './types';
import { scanProject, scanModule, extractExports, countLinesOfCode } from './scanner';
import { getCritPath } from '../paths';

/**
 * Generate a full project overview
 */
export async function generateOverview(projectPath: string): Promise<ProjectOverview> {
  // Detect project type and basic info
  const projectInfo = await analyzeProjectBasics(projectPath);

  // Scan project structure
  const { modules, structure } = await scanProject(projectPath);

  // Generate summary
  const summary = generateSummary(projectInfo, modules);

  return {
    name: projectInfo.name,
    type: projectInfo.type,
    modules,
    entryPoints: projectInfo.entryPoints,
    summary,
    structure,
  };
}

/**
 * Generate concise context string for LLM consumption
 */
export async function generateLLMContext(projectPath: string): Promise<string> {
  const overview = await generateOverview(projectPath);
  const lines: string[] = [];

  lines.push(`# Project: ${overview.name}`);
  lines.push('');
  lines.push(overview.summary);
  lines.push('');

  lines.push('## Structure');
  lines.push('```');
  lines.push(overview.structure);
  lines.push('```');
  lines.push('');

  if (overview.modules.length > 0) {
    lines.push('## Key Modules');
    lines.push('');

    for (const mod of overview.modules) {
      const relPath = relative(projectPath, mod.path);
      lines.push(`### ${mod.name} (${relPath})`);
      lines.push(mod.description);

      if (mod.exports.length > 0) {
        const exportStr = mod.exports.slice(0, 5).join(', ');
        const more = mod.exports.length > 5 ? `, +${mod.exports.length - 5} more` : '';
        lines.push(`Exports: ${exportStr}${more}`);
      }

      if (mod.dependencies.length > 0) {
        lines.push(`Dependencies: ${mod.dependencies.join(', ')}`);
      }

      lines.push(`LOC: ${mod.loc}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Update the stored overview after file changes
 */
export async function updateOverview(projectPath: string, changedFiles: string[]): Promise<void> {
  // For now, just regenerate the full overview
  // A more sophisticated implementation would update only affected modules
  const overview = await generateOverview(projectPath);
  const markdown = formatOverviewMarkdown(overview, projectPath);

  // Save to .crit/context/overview.md
  const overviewPath = getCritPath('context/overview.md', projectPath);
  await Bun.write(overviewPath, markdown);
}

/**
 * Generate feature status report by analyzing code
 */
export async function generateFeatureStatus(projectPath: string): Promise<FeatureStatus[]> {
  const features: FeatureStatus[] = [];

  // Scan for test files to determine what's tested
  const testFiles = await findTestFiles(projectPath);
  const testedModules = new Set<string>();

  for (const testFile of testFiles) {
    // Extract module name from test file name (e.g., "cart.test.ts" -> "cart")
    const testName = basename(testFile).replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '');
    testedModules.add(testName);
  }

  // Scan modules and create feature status
  const { modules } = await scanProject(projectPath);

  for (const mod of modules) {
    const status: FeatureStatus = {
      name: mod.name,
      status: 'untested',
      files: [mod.path],
      lastVerified: new Date().toISOString().split('T')[0],
    };

    // Check if this module has tests
    if (testedModules.has(mod.name)) {
      status.status = 'working'; // Assume working if tests exist
    }

    // Check for TODO/FIXME comments indicating partial/broken status
    const hasIssues = await checkForIssueMarkers(mod.path);
    if (hasIssues) {
      status.status = status.status === 'untested' ? 'broken' : 'partial';
    }

    features.push(status);
  }

  return features;
}

/**
 * Format overview as markdown for storage
 */
export function formatOverviewMarkdown(overview: ProjectOverview, projectPath: string): string {
  const lines: string[] = [];

  lines.push(`# Project: ${overview.name}`);
  lines.push('');
  lines.push(overview.summary);
  lines.push('');

  lines.push('## Structure');
  lines.push('```');
  lines.push(overview.structure);
  lines.push('```');
  lines.push('');

  if (overview.modules.length > 0) {
    lines.push('## Key Modules');
    lines.push('');

    for (const mod of overview.modules) {
      const relPath = relative(projectPath, mod.path);
      lines.push(`### ${mod.name} (${relPath})`);
      lines.push(mod.description);

      if (mod.exports.length > 0) {
        const exportLines: string[] = [];
        for (const exp of mod.exports.slice(0, 10)) {
          exportLines.push(`- \`${exp}\``);
        }
        if (mod.exports.length > 10) {
          exportLines.push(`- _...and ${mod.exports.length - 10} more_`);
        }
        lines.push('');
        lines.push('**Exports:**');
        lines.push(exportLines.join('\n'));
      }

      if (mod.dependencies.length > 0) {
        lines.push('');
        lines.push(`**Dependencies:** ${mod.dependencies.map(d => `\`${d}\``).join(', ')}`);
      }

      lines.push('');
      lines.push(`**LOC:** ${mod.loc}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }
  }

  lines.push('');
  lines.push(`_Generated: ${new Date().toISOString()}_`);

  return lines.join('\n');
}

// Helper functions

interface ProjectBasics {
  name: string;
  type: string;
  entryPoints: string[];
  dependencies: string[];
}

async function analyzeProjectBasics(projectPath: string): Promise<ProjectBasics> {
  const basics: ProjectBasics = {
    name: basename(projectPath),
    type: 'unknown',
    entryPoints: [],
    dependencies: [],
  };

  // Try to read package.json
  const packageJsonPath = join(projectPath, 'package.json');
  try {
    const packageJson = await Bun.file(packageJsonPath).json();
    basics.name = packageJson.name || basics.name;

    // Detect bun vs node
    const hasBunLock = await fileExists(join(projectPath, 'bun.lockb')) ||
                       await fileExists(join(projectPath, 'bun.lock'));
    basics.type = hasBunLock ? 'bun' : 'node';

    // Get entry points
    if (packageJson.main) {
      basics.entryPoints.push(packageJson.main);
    }
    if (packageJson.bin) {
      if (typeof packageJson.bin === 'string') {
        basics.entryPoints.push(packageJson.bin);
      } else {
        basics.entryPoints.push(...Object.values(packageJson.bin) as string[]);
      }
    }

    // Get dependencies
    if (packageJson.dependencies) {
      basics.dependencies.push(...Object.keys(packageJson.dependencies));
    }
  } catch {
    // Check for other project types
    if (await fileExists(join(projectPath, 'pyproject.toml'))) {
      basics.type = 'python';
    } else if (await fileExists(join(projectPath, 'Cargo.toml'))) {
      basics.type = 'rust';
    } else if (await fileExists(join(projectPath, 'go.mod'))) {
      basics.type = 'go';
    }
  }

  return basics;
}

function generateSummary(basics: ProjectBasics, modules: ModuleInfo[]): string {
  const parts: string[] = [];

  // First sentence: project type and name
  const typeLabel = basics.type === 'bun' ? 'Bun/TypeScript' :
                    basics.type === 'node' ? 'Node.js' :
                    basics.type.charAt(0).toUpperCase() + basics.type.slice(1);
  parts.push(`${typeLabel} project "${basics.name}".`);

  // Second sentence: module count and total LOC
  const totalLoc = modules.reduce((sum, m) => sum + m.loc, 0);
  const locStr = totalLoc >= 1000 ? `${(totalLoc / 1000).toFixed(1)}k` : totalLoc.toString();
  parts.push(`Contains ${modules.length} modules with ~${locStr} lines of code.`);

  // Third sentence: key modules
  if (modules.length > 0) {
    const topModules = modules
      .sort((a, b) => b.loc - a.loc)
      .slice(0, 3)
      .map(m => m.name);
    parts.push(`Key modules: ${topModules.join(', ')}.`);
  }

  return parts.join(' ');
}

async function findTestFiles(projectPath: string): Promise<string[]> {
  const files: string[] = [];
  const { Glob } = await import('bun');
  const glob = new Glob('**/*.{test,spec}.{ts,tsx,js,jsx}');

  try {
    for await (const file of glob.scan({ cwd: projectPath })) {
      if (!file.includes('node_modules')) {
        files.push(join(projectPath, file));
      }
    }
  } catch {
    // Directory might not exist
  }

  return files;
}

async function checkForIssueMarkers(path: string): Promise<boolean> {
  try {
    const { statSync } = await import('fs');
    const stat = statSync(path);

    if (stat.isDirectory()) {
      // Scan files in directory
      const { Glob } = await import('bun');
      const glob = new Glob('**/*.{ts,tsx,js,jsx}');

      for await (const file of glob.scan({ cwd: path })) {
        const content = await Bun.file(join(path, file)).text();
        if (/\/\/\s*(TODO|FIXME|BUG|HACK|XXX)/i.test(content)) {
          return true;
        }
      }
    } else {
      const content = await Bun.file(path).text();
      return /\/\/\s*(TODO|FIXME|BUG|HACK|XXX)/i.test(content);
    }
  } catch {
    // File might not be readable
  }

  return false;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
}
