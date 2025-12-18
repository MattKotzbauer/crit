/**
 * Represents a context documentation file
 */
export interface ContextFile {
  /** Name of the file (without path, e.g., "architecture.md") */
  name: string;
  /** Full path to the file */
  path: string;
  /** Content of the file */
  content: string;
}

/**
 * Analysis result for a project
 */
export interface ProjectAnalysis {
  /** Detected project type */
  type: 'bun' | 'node' | 'python' | 'rust' | 'go' | 'unknown';
  /** Main entry point files */
  entryPoints: string[];
  /** Main source directories */
  mainDirs: string[];
  /** List of dependencies */
  dependencies: string[];
  /** Package name if available */
  packageName?: string;
  /** Package version if available */
  packageVersion?: string;
}

/**
 * Result of context injection operation
 */
export interface InjectionResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Path to the modified file */
  filePath: string;
  /** Whether the file was created (vs modified) */
  created: boolean;
}
