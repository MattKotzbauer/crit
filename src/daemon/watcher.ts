import { watch, type FSWatcher } from "fs";
import { join, relative, extname } from "path";
import { readdir, stat } from "fs/promises";

export interface WatchEvent {
  type: "add" | "change" | "unlink";
  path: string;
  timestamp: Date;
}

type WatchCallback = (event: WatchEvent) => void;

// File extensions to watch
const WATCHED_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".json",
  ".md",
]);

// Directories to ignore
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".crit",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".orchestra",
  ".test-project", // Ignore test project within daemon folder
]);

function shouldWatch(filePath: string): boolean {
  // Check for ignored directories
  const parts = filePath.split("/");
  for (const part of parts) {
    if (IGNORED_DIRS.has(part)) {
      return false;
    }
  }

  // Check file extension
  const ext = extname(filePath);
  return WATCHED_EXTENSIONS.has(ext);
}

export interface WatcherHandle {
  stop: () => void;
}

/**
 * Create a file watcher for the given project path
 * Uses recursive fs.watch for efficiency (supported on macOS, Windows, and recent Linux kernels)
 */
export async function createWatcher(
  projectPath: string,
  callback: WatchCallback
): Promise<WatcherHandle> {
  const seenFiles = new Set<string>();
  let stopped = false;
  let watcher: FSWatcher | null = null;

  // Scan existing files to track them
  async function scanDirectory(dir: string): Promise<void> {
    if (stopped) return;

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (stopped) return;

        const fullPath = join(dir, entry.name);
        const relativePath = relative(projectPath, fullPath);

        if (entry.isDirectory()) {
          if (!IGNORED_DIRS.has(entry.name)) {
            await scanDirectory(fullPath);
          }
        } else if (entry.isFile() && shouldWatch(relativePath)) {
          seenFiles.add(fullPath);
        }
      }
    } catch {
      // Directory may not exist or be inaccessible
    }
  }

  // Scan existing files first
  await scanDirectory(projectPath);

  // Create a single recursive watcher
  try {
    watcher = watch(
      projectPath,
      { recursive: true },
      async (eventType, filename) => {
        if (stopped || !filename) return;

        // Skip ignored directories
        const parts = filename.split("/");
        for (const part of parts) {
          if (IGNORED_DIRS.has(part)) {
            return;
          }
        }

        // Check extension
        if (!shouldWatch(filename)) return;

        const fullPath = join(projectPath, filename);
        const relativePath = filename;

        try {
          const stats = await stat(fullPath);

          if (stats.isFile()) {
            const isNew = !seenFiles.has(fullPath);
            seenFiles.add(fullPath);

            callback({
              type: isNew ? "add" : "change",
              path: relativePath,
              timestamp: new Date(),
            });
          }
        } catch {
          // File was deleted
          if (seenFiles.has(fullPath)) {
            seenFiles.delete(fullPath);
            callback({
              type: "unlink",
              path: relativePath,
              timestamp: new Date(),
            });
          }
        }
      }
    );
  } catch (err) {
    // Watcher creation failed - might not support recursive
    console.error("Failed to create watcher:", err);
  }

  return {
    stop: () => {
      stopped = true;
      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },
  };
}
