/**
 * Information about a module/directory in the project
 */
export interface ModuleInfo {
  /** Module name (directory or file name without extension) */
  name: string;
  /** Full path to the module */
  path: string;
  /** One-line description of the module */
  description: string;
  /** Main exports from this module */
  exports: string[];
  /** Internal dependencies (other modules in this project) */
  dependencies: string[];
  /** Lines of code (excluding comments and blanks) */
  loc: number;
}

/**
 * Complete project overview
 */
export interface ProjectOverview {
  /** Project name from package.json or directory */
  name: string;
  /** Project type: bun, node, python, rust, go, unknown */
  type: string;
  /** All scanned modules */
  modules: ModuleInfo[];
  /** Entry point files */
  entryPoints: string[];
  /** 2-3 sentence summary of the project */
  summary: string;
  /** ASCII tree of project structure */
  structure: string;
}

/**
 * Feature status for tracking implementation state
 */
export interface FeatureStatus {
  /** Feature name */
  name: string;
  /** Implementation status */
  status: 'working' | 'partial' | 'broken' | 'untested';
  /** Files that implement this feature */
  files: string[];
  /** When status was last verified */
  lastVerified?: string;
}

/**
 * Result of scanning a file for exports
 */
export interface ExportInfo {
  /** Export name */
  name: string;
  /** Export type: function, class, const, type, interface, default */
  kind: 'function' | 'class' | 'const' | 'type' | 'interface' | 'default' | 'other';
  /** Line number where export is defined */
  line: number;
}

/**
 * Result of scanning a directory
 */
export interface DirectoryInfo {
  /** Directory name */
  name: string;
  /** Full path */
  path: string;
  /** Number of files */
  fileCount: number;
  /** Total lines of code */
  loc: number;
  /** Child directories */
  children: DirectoryInfo[];
  /** Files in this directory */
  files: FileInfo[];
}

/**
 * Information about a single file
 */
export interface FileInfo {
  /** File name */
  name: string;
  /** Full path */
  path: string;
  /** Lines of code */
  loc: number;
  /** Exports from this file */
  exports: ExportInfo[];
}
