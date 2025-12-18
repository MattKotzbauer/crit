/**
 * Bloat pattern detectors
 */

import { join } from "path";
import type { BloatIssue } from "./types";

/**
 * Detect exported symbols that are never imported elsewhere
 */
export async function detectUnusedExports(
  projectPath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
  const files: string[] = [];

  // Collect all source files
  for await (const file of glob.scan({
    cwd: projectPath,
    onlyFiles: true,
  })) {
    // Skip node_modules, test files, and type declarations
    if (
      file.includes("node_modules") ||
      file.endsWith(".test.ts") ||
      file.endsWith(".test.tsx") ||
      file.endsWith(".d.ts")
    ) {
      continue;
    }
    files.push(file);
  }

  // Extract all exports from each file
  const exportMap = new Map<string, { file: string; line: number }[]>();

  for (const file of files) {
    const content = await Bun.file(join(projectPath, file)).text();
    const lines = content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match named exports
      const exportMatches = line.match(
        /export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type|enum)\s+(\w+)/
      );
      if (exportMatches) {
        const name = exportMatches[1];
        if (!exportMap.has(name)) {
          exportMap.set(name, []);
        }
        exportMap.get(name)!.push({ file, line: i + 1 });
      }
    }
  }

  // Check which exports are never imported
  const allContent = await Promise.all(
    files.map(async (f) => Bun.file(join(projectPath, f)).text())
  );
  const combinedContent = allContent.join("\n");

  for (const [name, locations] of exportMap) {
    // Check if this export is imported anywhere
    const importPattern = new RegExp(
      `import\\s+.*\\b${name}\\b.*from|import\\s*{[^}]*\\b${name}\\b[^}]*}`,
      "m"
    );

    // Also check for dynamic imports and re-exports
    const usagePattern = new RegExp(`\\b${name}\\b`, "g");
    const matches = combinedContent.match(usagePattern);

    // If only appears once (the export itself), it's unused
    if (matches && matches.length <= 1 && !importPattern.test(combinedContent)) {
      // Skip if it's an index.ts file (re-exports are expected)
      for (const loc of locations) {
        if (loc.file.endsWith("index.ts")) continue;

        issues.push({
          type: "unused_export",
          file: loc.file,
          line: loc.line,
          description: `Export '${name}' is never imported elsewhere`,
          suggestion: `Consider removing the export or making '${name}' private`,
          severity: "medium",
        });
      }
    }
  }

  return issues;
}

/**
 * Detect files with too many abstractions (deep inheritance/composition)
 */
export async function detectOverAbstraction(
  projectPath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");

  for await (const file of glob.scan({
    cwd: projectPath,
    onlyFiles: true,
  })) {
    if (file.includes("node_modules")) continue;

    const content = await Bun.file(join(projectPath, file)).text();

    // Count class inheritance depth indicators
    const extendsCount = (content.match(/\bextends\b/g) || []).length;
    const implementsCount = (content.match(/\bimplements\b/g) || []).length;

    // Count factory patterns and abstract classes
    const abstractCount = (content.match(/\babstract\s+class\b/g) || []).length;
    const factoryCount = (
      content.match(/(?:Factory|Builder|Provider|Service)\b/g) || []
    ).length;

    // Count generic type parameters (excessive generics can be over-engineering)
    const genericCount = (content.match(/<[A-Z]\w*(?:\s+extends\s+\w+)?>/g) || [])
      .length;

    const abstractionScore =
      extendsCount * 2 +
      implementsCount +
      abstractCount * 3 +
      factoryCount * 2 +
      Math.max(0, genericCount - 3);

    if (abstractionScore > 10) {
      issues.push({
        type: "over_abstraction",
        file,
        description: `File has high abstraction complexity (score: ${abstractionScore})`,
        suggestion:
          "Consider simplifying - prefer composition over deep inheritance, reduce factory patterns if not needed",
        severity: abstractionScore > 20 ? "high" : "medium",
      });
    }

    // Detect unnecessary wrapper functions
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Match single-line wrapper functions
      // e.g., const foo = (x) => bar(x)
      const wrapperMatch = line.match(
        /(?:const|let|function)\s+(\w+)\s*=?\s*\([^)]*\)\s*(?:=>|{)\s*(?:return\s+)?(\w+)\s*\([^)]*\)\s*;?\s*}?\s*$/
      );
      if (wrapperMatch) {
        const [, wrapperName, calledFn] = wrapperMatch;
        if (wrapperName !== calledFn) {
          issues.push({
            type: "unnecessary_wrapper",
            file,
            line: i + 1,
            description: `Function '${wrapperName}' is a simple wrapper around '${calledFn}'`,
            suggestion: `Consider using '${calledFn}' directly instead of wrapping it`,
            severity: "low",
          });
        }
      }
    }
  }

  return issues;
}

/**
 * Detect duplicate/similar code blocks
 */
export async function detectDuplicates(
  projectPath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");
  const codeBlocks: Map<string, { file: string; line: number }[]> = new Map();

  for await (const file of glob.scan({
    cwd: projectPath,
    onlyFiles: true,
  })) {
    if (file.includes("node_modules") || file.endsWith(".test.ts")) continue;

    const content = await Bun.file(join(projectPath, file)).text();
    const lines = content.split("\n");

    // Extract function bodies (simplified - looks for 3+ line blocks)
    for (let i = 0; i < lines.length - 2; i++) {
      // Create a normalized 3-line block
      const block = lines
        .slice(i, i + 3)
        .map((l) =>
          l
            .trim()
            .replace(/\s+/g, " ")
            .replace(/["'`][^"'`]*["'`]/g, '""') // Normalize strings
            .replace(/\b\d+\b/g, "0") // Normalize numbers
        )
        .join("\n");

      // Skip trivial blocks
      if (block.length < 50) continue;
      if (block.match(/^[{}\s]*$/)) continue;

      if (!codeBlocks.has(block)) {
        codeBlocks.set(block, []);
      }
      codeBlocks.get(block)!.push({ file, line: i + 1 });
    }
  }

  // Find duplicates
  const reported = new Set<string>();
  for (const [block, locations] of codeBlocks) {
    if (locations.length > 1) {
      // Group by file to avoid reporting same-file duplicates
      const fileGroups = new Map<string, number[]>();
      for (const loc of locations) {
        if (!fileGroups.has(loc.file)) {
          fileGroups.set(loc.file, []);
        }
        fileGroups.get(loc.file)!.push(loc.line);
      }

      if (fileGroups.size > 1) {
        const key = [...fileGroups.keys()].sort().join(",");
        if (reported.has(key)) continue;
        reported.add(key);

        const filesStr = [...fileGroups.entries()]
          .map(([f, lines]) => `${f}:${lines[0]}`)
          .join(", ");

        issues.push({
          type: "duplicate_logic",
          file: [...fileGroups.keys()][0],
          line: [...fileGroups.values()][0][0],
          description: `Similar code found in multiple files: ${filesStr}`,
          suggestion: "Consider extracting shared logic into a reusable function",
          severity: "medium",
        });
      }
    }
  }

  return issues;
}

/**
 * Detect excessive comments (sign of unclear code)
 */
export async function detectExcessiveComments(
  filePath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];

  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    return issues;
  }

  const content = await file.text();
  const lines = content.split("\n");

  let codeLines = 0;
  let commentLines = 0;
  let inBlockComment = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("/*")) {
      inBlockComment = true;
      commentLines++;
      if (trimmed.includes("*/")) {
        inBlockComment = false;
      }
      continue;
    }

    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      commentLines++;
      continue;
    }

    if (trimmed.length > 0) {
      codeLines++;
    }
  }

  const totalLines = codeLines + commentLines;
  if (totalLines > 10) {
    const commentRatio = commentLines / totalLines;

    if (commentRatio > 0.3) {
      issues.push({
        type: "excessive_comments",
        file: filePath,
        description: `${Math.round(commentRatio * 100)}% of file is comments (${commentLines} comment lines, ${codeLines} code lines)`,
        suggestion:
          "High comment ratio may indicate unclear code. Consider refactoring to make code self-documenting",
        severity: commentRatio > 0.5 ? "high" : "medium",
      });
    }
  }

  return issues;
}

/**
 * Detect tiny files that might be better inlined
 */
export async function detectTinyFiles(
  projectPath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");

  for await (const file of glob.scan({
    cwd: projectPath,
    onlyFiles: true,
  })) {
    if (
      file.includes("node_modules") ||
      file.endsWith(".test.ts") ||
      file.endsWith("index.ts") ||
      file.endsWith(".d.ts")
    ) {
      continue;
    }

    const content = await Bun.file(join(projectPath, file)).text();
    const nonEmptyLines = content.split("\n").filter((l) => l.trim()).length;

    if (nonEmptyLines < 10) {
      issues.push({
        type: "tiny_file",
        file,
        description: `File has only ${nonEmptyLines} non-empty lines`,
        suggestion:
          "Consider inlining this code into a related file or combining with similar modules",
        severity: "low",
      });
    }
  }

  return issues;
}

/**
 * Detect massive files that should be split
 */
export async function detectMassiveFiles(
  projectPath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];
  const glob = new Bun.Glob("**/*.{ts,tsx,js,jsx}");

  for await (const file of glob.scan({
    cwd: projectPath,
    onlyFiles: true,
  })) {
    if (file.includes("node_modules")) continue;

    const content = await Bun.file(join(projectPath, file)).text();
    const lineCount = content.split("\n").length;

    if (lineCount > 500) {
      issues.push({
        type: "massive_file",
        file,
        description: `File has ${lineCount} lines`,
        suggestion:
          "Consider splitting this file into smaller, focused modules",
        severity: lineCount > 1000 ? "high" : "medium",
      });
    }
  }

  return issues;
}

/**
 * Detect config files with potentially unused options
 */
export async function detectConfigBloat(
  projectPath: string
): Promise<BloatIssue[]> {
  const issues: BloatIssue[] = [];

  // Check tsconfig.json
  const tsconfigPath = join(projectPath, "tsconfig.json");
  const tsconfigFile = Bun.file(tsconfigPath);

  if (await tsconfigFile.exists()) {
    try {
      const content = await tsconfigFile.text();
      const config = JSON.parse(content);
      const compilerOptions = config.compilerOptions || {};
      const optionCount = Object.keys(compilerOptions).length;

      if (optionCount > 20) {
        issues.push({
          type: "config_bloat",
          file: "tsconfig.json",
          description: `TypeScript config has ${optionCount} compiler options`,
          suggestion:
            "Review if all options are necessary - consider using a simpler base config",
          severity: "low",
        });
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  // Check package.json for excessive dependencies
  const packagePath = join(projectPath, "package.json");
  const packageFile = Bun.file(packagePath);

  if (await packageFile.exists()) {
    try {
      const content = await packageFile.text();
      const pkg = JSON.parse(content);
      const deps = Object.keys(pkg.dependencies || {}).length;
      const devDeps = Object.keys(pkg.devDependencies || {}).length;
      const totalDeps = deps + devDeps;

      if (totalDeps > 50) {
        issues.push({
          type: "config_bloat",
          file: "package.json",
          description: `Project has ${totalDeps} dependencies (${deps} prod, ${devDeps} dev)`,
          suggestion:
            "Review dependencies - some may be unused or replaceable with simpler alternatives",
          severity: totalDeps > 100 ? "high" : "medium",
        });
      }
    } catch {
      // Invalid JSON, skip
    }
  }

  return issues;
}
