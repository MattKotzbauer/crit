import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { join } from 'path';
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'fs';

import {
  // Manager
  loadContext,
  getContextFile,
  saveContextFile,
  listContextFiles,
  deleteContextFile,
  formatForLLM,
  ensureContextDir,
  // Analyzer
  analyzeProject,
  generateArchitectureDoc,
  generateImplementationDoc,
  getProjectSummary,
  // Injector
  injectIntoClaudeMd,
  removeFromClaudeMd,
  hasCritSection,
  getCritSection,
  // Types
  type ContextFile,
  type ProjectAnalysis,
} from './index';

const TEST_DIR = '/tmp/crit-context-test';

// Helper to set up clean test directory
function setupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
}

function cleanupTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

describe('Context Manager', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test('loadContext returns empty array for missing directory', async () => {
    const files = await loadContext(TEST_DIR);
    expect(files).toEqual([]);
  });

  test('saveContextFile creates file and directory', async () => {
    await saveContextFile(TEST_DIR, 'architecture', 'Test content');

    const filePath = join(TEST_DIR, '.crit/context/architecture.md');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe('Test content');
  });

  test('saveContextFile handles .md extension', async () => {
    await saveContextFile(TEST_DIR, 'test.md', 'Content');

    const filePath = join(TEST_DIR, '.crit/context/test.md');
    expect(existsSync(filePath)).toBe(true);
  });

  test('getContextFile returns file content', async () => {
    await saveContextFile(TEST_DIR, 'myfile', 'My content');

    const file = await getContextFile(TEST_DIR, 'myfile');
    expect(file).not.toBeNull();
    expect(file!.name).toBe('myfile.md');
    expect(file!.content).toBe('My content');
  });

  test('getContextFile returns null for missing file', async () => {
    const file = await getContextFile(TEST_DIR, 'nonexistent');
    expect(file).toBeNull();
  });

  test('listContextFiles returns all md files', async () => {
    await saveContextFile(TEST_DIR, 'file1', 'Content 1');
    await saveContextFile(TEST_DIR, 'file2', 'Content 2');

    const files = await listContextFiles(TEST_DIR);
    expect(files.sort()).toEqual(['file1.md', 'file2.md']);
  });

  test('loadContext returns all files with content', async () => {
    await saveContextFile(TEST_DIR, 'architecture', 'Arch content');
    await saveContextFile(TEST_DIR, 'implementation', 'Impl content');

    const files = await loadContext(TEST_DIR);
    expect(files.length).toBe(2);

    const arch = files.find(f => f.name === 'architecture.md');
    expect(arch).toBeDefined();
    expect(arch!.content).toBe('Arch content');
  });

  test('deleteContextFile removes file', async () => {
    await saveContextFile(TEST_DIR, 'todelete', 'Delete me');

    const deleted = await deleteContextFile(TEST_DIR, 'todelete');
    expect(deleted).toBe(true);

    const file = await getContextFile(TEST_DIR, 'todelete');
    expect(file).toBeNull();
  });

  test('deleteContextFile returns false for nonexistent file', async () => {
    const deleted = await deleteContextFile(TEST_DIR, 'nonexistent');
    expect(deleted).toBe(false);
  });

  test('formatForLLM formats files correctly', () => {
    const files: ContextFile[] = [
      { name: 'architecture.md', path: '/test/arch.md', content: 'Arch details' },
      { name: 'implementation.md', path: '/test/impl.md', content: 'Impl details' },
    ];

    const formatted = formatForLLM(files);
    expect(formatted).toContain('## architecture');
    expect(formatted).toContain('Arch details');
    expect(formatted).toContain('## implementation');
    expect(formatted).toContain('Impl details');
    expect(formatted).toContain('---');
  });

  test('formatForLLM returns empty string for empty array', () => {
    const formatted = formatForLLM([]);
    expect(formatted).toBe('');
  });

  test('ensureContextDir creates directory', async () => {
    await ensureContextDir(TEST_DIR);
    expect(existsSync(join(TEST_DIR, '.crit/context'))).toBe(true);
  });
});

describe('Project Analyzer', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test('analyzeProject detects bun project', async () => {
    writeFileSync(
      join(TEST_DIR, 'package.json'),
      JSON.stringify({ name: 'test-project', version: '1.0.0' })
    );
    writeFileSync(join(TEST_DIR, 'bun.lockb'), '');

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.type).toBe('bun');
    expect(analysis.packageName).toBe('test-project');
    expect(analysis.packageVersion).toBe('1.0.0');
  });

  test('analyzeProject detects node project', async () => {
    writeFileSync(
      join(TEST_DIR, 'package.json'),
      JSON.stringify({ name: 'node-project' })
    );
    // No bun.lockb = node

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.type).toBe('node');
  });

  test('analyzeProject detects python project', async () => {
    writeFileSync(join(TEST_DIR, 'pyproject.toml'), '[project]');

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.type).toBe('python');
  });

  test('analyzeProject detects rust project', async () => {
    writeFileSync(join(TEST_DIR, 'Cargo.toml'), '[package]');

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.type).toBe('rust');
  });

  test('analyzeProject detects go project', async () => {
    writeFileSync(join(TEST_DIR, 'go.mod'), 'module test');

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.type).toBe('go');
  });

  test('analyzeProject finds main directories', async () => {
    mkdirSync(join(TEST_DIR, 'src'));
    mkdirSync(join(TEST_DIR, 'lib'));

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.mainDirs).toContain('src');
    expect(analysis.mainDirs).toContain('lib');
  });

  test('analyzeProject finds entry points', async () => {
    writeFileSync(join(TEST_DIR, 'index.ts'), 'export {}');

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.entryPoints).toContain('index.ts');
  });

  test('analyzeProject extracts dependencies', async () => {
    writeFileSync(
      join(TEST_DIR, 'package.json'),
      JSON.stringify({
        dependencies: { react: '^18.0.0' },
        devDependencies: { typescript: '^5.0.0' },
      })
    );

    const analysis = await analyzeProject(TEST_DIR);
    expect(analysis.dependencies).toContain('react');
    expect(analysis.dependencies).toContain('typescript');
  });

  test('generateArchitectureDoc creates valid markdown', () => {
    const analysis: ProjectAnalysis = {
      type: 'bun',
      packageName: 'my-project',
      packageVersion: '2.0.0',
      entryPoints: ['src/index.ts'],
      mainDirs: ['src', 'lib'],
      dependencies: [],
    };

    const doc = generateArchitectureDoc(analysis);
    expect(doc).toContain('# Architecture');
    expect(doc).toContain('**bun** project');
    expect(doc).toContain('my-project');
    expect(doc).toContain('v2.0.0');
    expect(doc).toContain('src/');
    expect(doc).toContain('src/index.ts');
  });

  test('generateImplementationDoc includes dependencies', () => {
    const analysis: ProjectAnalysis = {
      type: 'node',
      entryPoints: [],
      mainDirs: [],
      dependencies: ['express', 'lodash'],
    };

    const doc = generateImplementationDoc(analysis);
    expect(doc).toContain('# Implementation');
    expect(doc).toContain('express');
    expect(doc).toContain('lodash');
  });

  test('getProjectSummary returns concise summary', () => {
    const analysis: ProjectAnalysis = {
      type: 'bun',
      packageName: 'cool-app',
      entryPoints: [],
      mainDirs: ['src', 'lib'],
      dependencies: [],
    };

    const summary = getProjectSummary(analysis);
    expect(summary).toContain('bun project');
    expect(summary).toContain('cool-app');
    expect(summary).toContain('src, lib');
  });
});

describe('CLAUDE.md Injector', () => {
  beforeEach(setupTestDir);
  afterEach(cleanupTestDir);

  test('injectIntoClaudeMd creates new file', async () => {
    const result = await injectIntoClaudeMd(TEST_DIR, 'Test context');

    expect(result.success).toBe(true);
    expect(result.created).toBe(true);

    const filePath = join(TEST_DIR, '.claude/CLAUDE.md');
    expect(existsSync(filePath)).toBe(true);

    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('<!-- CRIT:START -->');
    expect(content).toContain('<!-- CRIT:END -->');
    expect(content).toContain('Test context');
  });

  test('injectIntoClaudeMd appends to existing file', async () => {
    const claudeDir = join(TEST_DIR, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'CLAUDE.md'),
      '# Existing Content\n\nSome instructions.'
    );

    const result = await injectIntoClaudeMd(TEST_DIR, 'New context');

    expect(result.success).toBe(true);
    expect(result.created).toBe(false);

    const content = readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Existing Content');
    expect(content).toContain('Some instructions.');
    expect(content).toContain('<!-- CRIT:START -->');
    expect(content).toContain('New context');
  });

  test('injectIntoClaudeMd replaces existing section', async () => {
    const claudeDir = join(TEST_DIR, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'CLAUDE.md'),
      `# Header

<!-- CRIT:START -->
## Crit Context

Old content

<!-- CRIT:END -->

# Footer`
    );

    await injectIntoClaudeMd(TEST_DIR, 'Updated content');

    const content = readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Header');
    expect(content).toContain('# Footer');
    expect(content).toContain('Updated content');
    expect(content).not.toContain('Old content');
  });

  test('removeFromClaudeMd removes section', async () => {
    const claudeDir = join(TEST_DIR, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'CLAUDE.md'),
      `# Header

<!-- CRIT:START -->
## Crit Context

Content

<!-- CRIT:END -->

# Footer`
    );

    const removed = await removeFromClaudeMd(TEST_DIR);
    expect(removed).toBe(true);

    const content = readFileSync(join(claudeDir, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('# Header');
    expect(content).toContain('# Footer');
    expect(content).not.toContain('CRIT:START');
    expect(content).not.toContain('Content');
  });

  test('removeFromClaudeMd returns false for missing file', async () => {
    const removed = await removeFromClaudeMd(TEST_DIR);
    expect(removed).toBe(false);
  });

  test('hasCritSection detects presence', async () => {
    const claudeDir = join(TEST_DIR, '.claude');
    mkdirSync(claudeDir, { recursive: true });

    expect(await hasCritSection(TEST_DIR)).toBe(false);

    writeFileSync(
      join(claudeDir, 'CLAUDE.md'),
      '<!-- CRIT:START -->\nContent\n<!-- CRIT:END -->'
    );

    expect(await hasCritSection(TEST_DIR)).toBe(true);
  });

  test('getCritSection extracts content', async () => {
    const claudeDir = join(TEST_DIR, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'CLAUDE.md'),
      `<!-- CRIT:START -->
## Crit Context

My extracted content here

<!-- CRIT:END -->`
    );

    const section = await getCritSection(TEST_DIR);
    expect(section).toBe('My extracted content here');
  });

  test('getCritSection returns null when missing', async () => {
    const section = await getCritSection(TEST_DIR);
    expect(section).toBeNull();
  });
});
