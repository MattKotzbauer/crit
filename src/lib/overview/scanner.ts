import { join, relative, basename, dirname } from 'path';
import { Glob } from 'bun';
import type { ModuleInfo, ExportInfo, DirectoryInfo, FileInfo } from './types';

/**
 * Scan project structure and return module information
 */
export async function scanProject(projectPath: string): Promise<{
  modules: ModuleInfo[];
  structure: string;
}> {
  const srcDir = join(projectPath, 'src');
  const hasSrc = await dirExists(srcDir);
  const scanRoot = hasSrc ? srcDir : projectPath;

  // Get all TypeScript/JavaScript files
  const files = await getAllSourceFiles(scanRoot);

  // Group files by module (directory with index.ts or standalone files)
  const modules = await detectModules(scanRoot, files);

  // Generate ASCII tree structure
  const structure = await generateStructureTree(scanRoot, projectPath);

  return { modules, structure };
}

/**
 * Scan a single module directory
 */
export async function scanModule(modulePath: string): Promise<ModuleInfo> {
  const name = basename(modulePath);
  const files = await getAllSourceFiles(modulePath);

  // Get exports from index file or main file
  const indexPath = join(modulePath, 'index.ts');
  const indexExists = await fileExists(indexPath);

  let exports: string[] = [];
  if (indexExists) {
    const exportInfos = await extractExports(indexPath);
    exports = exportInfos.map(e => e.name);
  } else if (files.length === 1 && files[0]) {
    const exportInfos = await extractExports(files[0]);
    exports = exportInfos.map(e => e.name);
  }

  // Calculate total LOC
  let totalLoc = 0;
  for (const file of files) {
    totalLoc += await countLinesOfCode(file);
  }

  // Detect dependencies
  const dependencies = await detectDependencies(modulePath, files);

  // Generate description from exports
  const description = generateModuleDescription(name, exports);

  return {
    name,
    path: modulePath,
    description,
    exports,
    dependencies,
    loc: totalLoc,
  };
}

/**
 * Extract exports from a TypeScript/JavaScript file
 */
export async function extractExports(filePath: string): Promise<ExportInfo[]> {
  try {
    const content = await Bun.file(filePath).text();
    const exports: ExportInfo[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      const lineNum = i + 1;

      // export function name
      const funcMatch = line.match(/^export\s+(?:async\s+)?function\s+(\w+)/);
      if (funcMatch && funcMatch[1]) {
        exports.push({ name: funcMatch[1], kind: 'function', line: lineNum });
        continue;
      }

      // export class Name
      const classMatch = line.match(/^export\s+class\s+(\w+)/);
      if (classMatch && classMatch[1]) {
        exports.push({ name: classMatch[1], kind: 'class', line: lineNum });
        continue;
      }

      // export const name
      const constMatch = line.match(/^export\s+const\s+(\w+)/);
      if (constMatch && constMatch[1]) {
        exports.push({ name: constMatch[1], kind: 'const', line: lineNum });
        continue;
      }

      // export type Name
      const typeMatch = line.match(/^export\s+type\s+(\w+)/);
      if (typeMatch && typeMatch[1]) {
        exports.push({ name: typeMatch[1], kind: 'type', line: lineNum });
        continue;
      }

      // export interface Name
      const interfaceMatch = line.match(/^export\s+interface\s+(\w+)/);
      if (interfaceMatch && interfaceMatch[1]) {
        exports.push({ name: interfaceMatch[1], kind: 'interface', line: lineNum });
        continue;
      }

      // export default
      const defaultMatch = line.match(/^export\s+default\s+(?:class|function)?\s*(\w+)?/);
      if (defaultMatch) {
        exports.push({ name: defaultMatch[1] || 'default', kind: 'default', line: lineNum });
        continue;
      }

      // export { name, name2 } - named exports
      const namedMatch = line.match(/^export\s+\{([^}]+)\}/);
      if (namedMatch && namedMatch[1]) {
        const names = namedMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean);
        for (const name of names) {
          if (name) {
            exports.push({ name, kind: 'other', line: lineNum });
          }
        }
        continue;
      }

      // export type { name } - type exports
      const typeExportMatch = line.match(/^export\s+type\s+\{([^}]+)\}/);
      if (typeExportMatch && typeExportMatch[1]) {
        const names = typeExportMatch[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]?.trim()).filter(Boolean);
        for (const name of names) {
          if (name) {
            exports.push({ name, kind: 'type', line: lineNum });
          }
        }
        continue;
      }
    }

    return exports;
  } catch {
    return [];
  }
}

/**
 * Count lines of code (excluding comments and blank lines)
 */
export async function countLinesOfCode(filePath: string): Promise<number> {
  try {
    const content = await Bun.file(filePath).text();
    const lines = content.split('\n');
    let loc = 0;
    let inBlockComment = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Handle block comments
      if (inBlockComment) {
        if (trimmed.includes('*/')) {
          inBlockComment = false;
        }
        continue;
      }

      if (trimmed.startsWith('/*')) {
        if (!trimmed.includes('*/')) {
          inBlockComment = true;
        }
        continue;
      }

      // Skip blank lines and single-line comments
      if (trimmed === '' || trimmed.startsWith('//')) {
        continue;
      }

      loc++;
    }

    return loc;
  } catch {
    return 0;
  }
}

/**
 * Get all source files in a directory
 */
async function getAllSourceFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const glob = new Glob('**/*.{ts,tsx,js,jsx}');

  try {
    for await (const file of glob.scan({ cwd: dir })) {
      // Skip test files, node_modules, etc.
      if (
        file.includes('node_modules') ||
        file.includes('.test.') ||
        file.includes('.spec.') ||
        file.includes('__tests__')
      ) {
        continue;
      }
      files.push(join(dir, file));
    }
  } catch {
    // Directory might not exist
  }

  return files;
}

/**
 * Detect modules from file list
 */
async function detectModules(scanRoot: string, files: string[]): Promise<ModuleInfo[]> {
  const modules: ModuleInfo[] = [];
  const processedDirs = new Set<string>();

  for (const file of files) {
    const dir = dirname(file);

    // Skip if we already processed this directory
    if (processedDirs.has(dir)) continue;

    // Check if this is a module directory (has index.ts)
    const indexPath = join(dir, 'index.ts');
    const hasIndex = await fileExists(indexPath);

    if (hasIndex && dir !== scanRoot) {
      // This is a module directory
      processedDirs.add(dir);
      const module = await scanModule(dir);
      modules.push(module);
    } else if (dir === scanRoot) {
      // Files in the root - treat each as its own module
      const fileName = basename(file);
      if (fileName !== 'index.ts') {
        const exports = await extractExports(file);
        const loc = await countLinesOfCode(file);
        const name = fileName.replace(/\.(ts|tsx|js|jsx)$/, '');

        modules.push({
          name,
          path: file,
          description: generateModuleDescription(name, exports.map(e => e.name)),
          exports: exports.map(e => e.name),
          dependencies: [],
          loc,
        });
      }
    }
  }

  // Sort by name
  modules.sort((a, b) => a.name.localeCompare(b.name));

  return modules;
}

/**
 * Generate ASCII tree structure
 */
async function generateStructureTree(scanRoot: string, projectPath: string): Promise<string> {
  const dirInfo = await scanDirectory(scanRoot);
  const relativeRoot = relative(projectPath, scanRoot) || basename(scanRoot);
  return formatTreeNode(dirInfo, '', true, relativeRoot);
}

/**
 * Scan a directory recursively for tree generation
 */
async function scanDirectory(dir: string): Promise<DirectoryInfo> {
  const name = basename(dir);
  const files: FileInfo[] = [];
  const children: DirectoryInfo[] = [];
  let totalLoc = 0;

  try {
    const { readdirSync, statSync } = await import('fs');
    const entries = readdirSync(dir);

    for (const entry of entries) {
      // Skip hidden files and common non-source dirs
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === 'build') {
        continue;
      }

      const entryPath = join(dir, entry);
      const stat = statSync(entryPath);

      if (stat.isDirectory()) {
        const childInfo = await scanDirectory(entryPath);
        children.push(childInfo);
        totalLoc += childInfo.loc;
      } else if (isSourceFile(entry)) {
        const loc = await countLinesOfCode(entryPath);
        const exports = await extractExports(entryPath);
        files.push({
          name: entry,
          path: entryPath,
          loc,
          exports,
        });
        totalLoc += loc;
      }
    }
  } catch {
    // Directory might not be readable
  }

  // Sort children and files
  children.sort((a, b) => a.name.localeCompare(b.name));
  files.sort((a, b) => a.name.localeCompare(b.name));

  return {
    name,
    path: dir,
    fileCount: files.length,
    loc: totalLoc,
    children,
    files,
  };
}

/**
 * Format directory info as ASCII tree
 */
function formatTreeNode(dir: DirectoryInfo, prefix: string, isLast: boolean, displayName?: string): string {
  const lines: string[] = [];
  const name = displayName || dir.name;

  // Add this directory
  const locStr = dir.loc > 0 ? ` (${dir.fileCount} files, ${formatLoc(dir.loc)})` : '';
  lines.push(`${name}/${locStr}`);

  const childPrefix = prefix + (isLast ? '    ' : '|   ');
  const items = [...dir.children, ...dir.files];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const isLastItem = i === items.length - 1;
    const connector = isLastItem ? '`-- ' : '|-- ';

    if ('children' in item) {
      // It's a directory
      const subtree = formatTreeNode(item, childPrefix, isLastItem);
      const subtreeLines = subtree.split('\n');
      const firstLine = subtreeLines[0] ?? '';
      lines.push(prefix + connector + firstLine);
      for (let j = 1; j < subtreeLines.length; j++) {
        const subLine = subtreeLines[j];
        if (subLine !== undefined) {
          lines.push(subLine);
        }
      }
    } else {
      // It's a file
      const exportStr = item.exports.length > 0
        ? ` (${item.exports.slice(0, 3).map(e => e.name).join(', ')}${item.exports.length > 3 ? '...' : ''})`
        : '';
      lines.push(`${prefix}${connector}${item.name}${exportStr}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format lines of code with k suffix for thousands
 */
function formatLoc(loc: number): string {
  if (loc >= 1000) {
    return `${(loc / 1000).toFixed(1)}k loc`;
  }
  return `${loc} loc`;
}

/**
 * Detect dependencies for a module
 */
async function detectDependencies(modulePath: string, files: string[]): Promise<string[]> {
  const deps = new Set<string>();
  const moduleName = basename(modulePath);

  for (const file of files) {
    try {
      const content = await Bun.file(file).text();

      // Match relative imports like import { x } from '../other-module'
      const importMatches = content.matchAll(/from\s+['"](\.\.[^'"]+|\.\/[^'"]+)['"]/g);

      for (const match of importMatches) {
        const importPath = match[1];
        if (!importPath) continue;
        // Extract the module name from the path
        const parts = importPath.split('/');
        for (const part of parts) {
          if (part !== '.' && part !== '..' && !part.includes('.')) {
            // Skip if it's the same module
            if (part !== moduleName) {
              deps.add(part);
            }
          }
        }
      }
    } catch {
      // File might not be readable
    }
  }

  return Array.from(deps).sort();
}

/**
 * Generate a one-line description for a module based on its exports
 */
function generateModuleDescription(name: string, exports: string[]): string {
  if (exports.length === 0) {
    return `${name} module`;
  }

  const mainExports = exports.slice(0, 3);
  const suffix = exports.length > 3 ? ` and ${exports.length - 3} more` : '';

  return `Exports: ${mainExports.join(', ')}${suffix}`;
}

/**
 * Check if a file is a source file
 */
function isSourceFile(filename: string): boolean {
  return /\.(ts|tsx|js|jsx)$/.test(filename) &&
         !filename.includes('.test.') &&
         !filename.includes('.spec.');
}

/**
 * Check if a file exists
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
}

/**
 * Check if a directory exists
 */
async function dirExists(path: string): Promise<boolean> {
  try {
    const { existsSync, statSync } = await import('fs');
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}
