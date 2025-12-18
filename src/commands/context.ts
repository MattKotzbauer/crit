import { readdir } from "fs/promises";
import { getCritDir, getCritPath, paths, critExists } from "../lib/paths";

export async function context() {
  const critDir = getCritDir();

  if (!critExists()) {
    console.log("crit is not initialized. Run 'crit init' first.");
    return;
  }

  const contextDir = getCritPath(paths.context);

  try {
    const files = await readdir(contextDir);

    console.log("Context files:");
    console.log("──────────────");

    for (const file of files) {
      if (file.endsWith(".md")) {
        const filePath = `${contextDir}/${file}`;
        const content = await Bun.file(filePath).text();
        const lines = content.split("\n").length;
        console.log(`  ${file} (${lines} lines)`);
      }
    }

    if (files.filter(f => f.endsWith(".md")).length === 0) {
      console.log("  No context files found.");
    }
  } catch {
    console.log("Context directory not found.");
  }
}
