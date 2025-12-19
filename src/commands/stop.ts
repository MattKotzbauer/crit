/**
 * crit stop - Stop the daemon
 *
 * Finds and stops any running crit daemon for this project.
 */

import { existsSync } from "fs";
import { join } from "path";
import { readFile, rm } from "fs/promises";

export async function stop() {
  const cwd = process.cwd();
  const pidFile = join(cwd, ".crit", "daemon.pid");

  if (!existsSync(pidFile)) {
    console.log("No daemon running (no pid file found)");
    return;
  }

  try {
    const pid = parseInt(await readFile(pidFile, "utf-8"), 10);

    // Try to kill the process
    try {
      process.kill(pid, "SIGTERM");
      console.log(`Stopped daemon (pid ${pid})`);
    } catch (e: unknown) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") {
        console.log("Daemon was not running (stale pid file)");
      } else {
        throw e;
      }
    }

    // Clean up pid file
    await rm(pidFile, { force: true });
  } catch (error) {
    console.log("Error stopping daemon:", error);
  }
}
