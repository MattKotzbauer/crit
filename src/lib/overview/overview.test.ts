import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdir, rm } from 'fs/promises';
import { join } from 'path';
import {
  scanProject,
  scanModule,
  extractExports,
  countLinesOfCode,
  generateOverview,
  generateLLMContext,
  formatOverviewMarkdown,
} from './index';

const TEST_DIR = '/tmp/crit-overview-test';

// Create a test project structure
async function setupTestProject() {
  await rm(TEST_DIR, { recursive: true, force: true });
  await mkdir(TEST_DIR, { recursive: true });

  // Create package.json
  await Bun.write(
    join(TEST_DIR, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      version: '1.0.0',
      main: 'src/index.ts',
    })
  );

  // Create bun.lock to indicate it's a bun project
  await Bun.write(join(TEST_DIR, 'bun.lock'), '');

  // Create src directory structure
  await mkdir(join(TEST_DIR, 'src/lib/utils'), { recursive: true });
  await mkdir(join(TEST_DIR, 'src/lib/api'), { recursive: true });

  // Create test source files
  await Bun.write(
    join(TEST_DIR, 'src/index.ts'),
    `// Entry point
export function main() {
  console.log('Hello');
}

export default main;
`
  );

  await Bun.write(
    join(TEST_DIR, 'src/lib/utils/index.ts'),
    `// Utils module
export function formatDate(date: Date): string {
  return date.toISOString();
}

export function parseDate(str: string): Date {
  return new Date(str);
}

export const VERSION = '1.0.0';

export type DateFormat = 'iso' | 'unix' | 'human';

export interface DateOptions {
  format: DateFormat;
  timezone?: string;
}
`
  );

  await Bun.write(
    join(TEST_DIR, 'src/lib/api/index.ts'),
    `// API module
import { formatDate } from '../utils';

export async function fetchData(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}

export class ApiClient {
  constructor(private baseUrl: string) {}

  async get(path: string) {
    return fetchData(this.baseUrl + path);
  }
}
`
  );

  await Bun.write(
    join(TEST_DIR, 'src/lib/api/helpers.ts'),
    `// Helper functions
export function buildUrl(base: string, path: string): string {
  return base + '/' + path;
}
`
  );
}

async function cleanupTestProject() {
  await rm(TEST_DIR, { recursive: true, force: true });
}

describe('overview', () => {
  beforeAll(async () => {
    await setupTestProject();
  });

  afterAll(async () => {
    await cleanupTestProject();
  });

  describe('extractExports', () => {
    test('extracts function exports', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/lib/utils/index.ts'));
      const functionExports = exports.filter(e => e.kind === 'function');
      expect(functionExports.length).toBe(2);
      expect(functionExports.map(e => e.name)).toContain('formatDate');
      expect(functionExports.map(e => e.name)).toContain('parseDate');
    });

    test('extracts const exports', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/lib/utils/index.ts'));
      const constExports = exports.filter(e => e.kind === 'const');
      expect(constExports.length).toBe(1);
      expect(constExports[0]?.name).toBe('VERSION');
    });

    test('extracts type exports', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/lib/utils/index.ts'));
      const typeExports = exports.filter(e => e.kind === 'type');
      expect(typeExports.length).toBe(1);
      expect(typeExports[0]?.name).toBe('DateFormat');
    });

    test('extracts interface exports', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/lib/utils/index.ts'));
      const interfaceExports = exports.filter(e => e.kind === 'interface');
      expect(interfaceExports.length).toBe(1);
      expect(interfaceExports[0]?.name).toBe('DateOptions');
    });

    test('extracts class exports', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/lib/api/index.ts'));
      const classExports = exports.filter(e => e.kind === 'class');
      expect(classExports.length).toBe(1);
      expect(classExports[0]?.name).toBe('ApiClient');
    });

    test('extracts default exports', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/index.ts'));
      const defaultExports = exports.filter(e => e.kind === 'default');
      expect(defaultExports.length).toBe(1);
    });

    test('includes line numbers', async () => {
      const exports = await extractExports(join(TEST_DIR, 'src/lib/utils/index.ts'));
      const formatDate = exports.find(e => e.name === 'formatDate');
      expect(formatDate).toBeDefined();
      expect(formatDate!.line).toBeGreaterThan(0);
    });
  });

  describe('countLinesOfCode', () => {
    test('counts non-blank non-comment lines', async () => {
      const loc = await countLinesOfCode(join(TEST_DIR, 'src/lib/utils/index.ts'));
      // Should count actual code lines, not comments or blank lines
      expect(loc).toBeGreaterThan(5);
      expect(loc).toBeLessThan(20);
    });

    test('returns 0 for non-existent file', async () => {
      const loc = await countLinesOfCode(join(TEST_DIR, 'nonexistent.ts'));
      expect(loc).toBe(0);
    });
  });

  describe('scanModule', () => {
    test('scans module directory with index.ts', async () => {
      const module = await scanModule(join(TEST_DIR, 'src/lib/utils'));
      expect(module.name).toBe('utils');
      expect(module.exports).toContain('formatDate');
      expect(module.exports).toContain('parseDate');
      expect(module.loc).toBeGreaterThan(0);
    });

    test('detects dependencies', async () => {
      const module = await scanModule(join(TEST_DIR, 'src/lib/api'));
      expect(module.dependencies).toContain('utils');
    });

    test('generates description from exports', async () => {
      const module = await scanModule(join(TEST_DIR, 'src/lib/utils'));
      expect(module.description).toContain('formatDate');
    });
  });

  describe('scanProject', () => {
    test('finds all modules', async () => {
      const { modules } = await scanProject(TEST_DIR);
      expect(modules.length).toBeGreaterThan(0);
      const moduleNames = modules.map(m => m.name);
      expect(moduleNames).toContain('utils');
      expect(moduleNames).toContain('api');
    });

    test('generates structure tree', async () => {
      const { structure } = await scanProject(TEST_DIR);
      expect(structure).toContain('src/');
      expect(structure).toContain('lib');
    });
  });

  describe('generateOverview', () => {
    test('generates complete overview', async () => {
      const overview = await generateOverview(TEST_DIR);
      expect(overview.name).toBe('test-project');
      expect(overview.type).toBe('bun');
      expect(overview.modules.length).toBeGreaterThan(0);
      expect(overview.summary).toContain('test-project');
      expect(overview.structure).toBeTruthy();
    });

    test('detects entry points from package.json', async () => {
      const overview = await generateOverview(TEST_DIR);
      expect(overview.entryPoints).toContain('src/index.ts');
    });
  });

  describe('generateLLMContext', () => {
    test('generates markdown context', async () => {
      const context = await generateLLMContext(TEST_DIR);
      expect(context).toContain('# Project: test-project');
      expect(context).toContain('## Structure');
      expect(context).toContain('## Key Modules');
    });
  });

  describe('formatOverviewMarkdown', () => {
    test('formats overview as markdown', async () => {
      const overview = await generateOverview(TEST_DIR);
      const markdown = formatOverviewMarkdown(overview, TEST_DIR);
      expect(markdown).toContain('# Project: test-project');
      expect(markdown).toContain('**Exports:**');
      expect(markdown).toContain('_Generated:');
    });
  });
});
