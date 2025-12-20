/**
 * Import Analysis - finds unused imports and exports
 *
 * LLMs often import everything "just in case". This module
 * detects imports that are never used in the file.
 */

import { readFileSync } from "fs";
import type { Criticism } from "../criticism/types";
import { generateCriticismId } from "../criticism/store";

interface Import {
  name: string;
  isDefault: boolean;
  isType: boolean;
  line: number;
}

/**
 * Parse imports from a TypeScript/JavaScript file
 */
function parseImports(content: string): Import[] {
  const imports: Import[] = [];
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Match: import X from '...'
    const defaultMatch = line.match(/import\s+(\w+)\s+from/);
    if (defaultMatch && defaultMatch[1]) {
      imports.push({
        name: defaultMatch[1],
        isDefault: true,
        isType: line.includes("import type"),
        line: i + 1,
      });
    }

    // Match: import { X, Y, Z } from '...'
    const namedMatch = line.match(/import\s+(?:type\s+)?{([^}]+)}/);
    if (namedMatch && namedMatch[1]) {
      const names = namedMatch[1].split(",").map((n) => n.trim());
      for (const name of names) {
        // Handle 'X as Y' aliasing
        const aliasMatch = name.match(/(\w+)\s+as\s+(\w+)/);
        const actualName = aliasMatch ? aliasMatch[2]! : name.split(" ")[0]!;
        // Must be a valid identifier (at least 2 chars, starts with letter)
        if (actualName && actualName.length >= 2 && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(actualName)) {
          imports.push({
            name: actualName,
            isDefault: false,
            isType: line.includes("import type") || name.includes("type "),
            line: i + 1,
          });
        }
      }
    }

    // Match: import * as X from '...'
    const namespaceMatch = line.match(/import\s+\*\s+as\s+(\w+)\s+from/);
    if (namespaceMatch && namespaceMatch[1]) {
      imports.push({
        name: namespaceMatch[1],
        isDefault: false,
        isType: false,
        line: i + 1,
      });
    }
  }

  return imports;
}

/**
 * Check if an import is used in the file content
 */
function isImportUsed(importName: string, content: string, importLine: number): boolean {
  const lines = content.split("\n");

  // Skip the import line itself and check the rest
  for (let i = 0; i < lines.length; i++) {
    if (i === importLine - 1) continue; // Skip the import line

    const line = lines[i];
    if (!line) continue;

    // Skip other import lines
    if (line.trim().startsWith("import ")) continue;

    // Check if the name appears as a word boundary match
    const pattern = new RegExp(`\\b${importName}\\b`);
    if (pattern.test(line)) {
      return true;
    }
  }

  return false;
}

/**
 * Find unused imports in a file
 */
export function findUnusedImports(filePath: string): Criticism[] {
  const criticisms: Criticism[] = [];

  // Skip non-source files
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
    return [];
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const imports = parseImports(content);

    const unusedImports: Import[] = [];

    for (const imp of imports) {
      if (!isImportUsed(imp.name, content, imp.line)) {
        unusedImports.push(imp);
      }
    }

    if (unusedImports.length > 0) {
      const names = unusedImports.map((i) => i.name).join(", ");
      const subject = `unused import${unusedImports.length > 1 ? "s" : ""}: ${names.slice(0, 40)}${names.length > 40 ? "..." : ""}`;

      criticisms.push({
        id: generateCriticismId("ELIM", subject, [filePath]),
        category: "ELIM",
        subject,
        description: `Found ${unusedImports.length} unused import${unusedImports.length > 1 ? "s" : ""}: ${names}. These can be safely removed to reduce bundle size and improve clarity.`,
        files: [filePath],
        location: `${filePath}:${unusedImports[0]?.line || 1}`,
        severity: unusedImports.length >= 5 ? "medium" : "low",
        status: "pending",
        createdAt: new Date().toISOString(),
      });
    }
  } catch {
    // Ignore read errors
  }

  return criticisms;
}
