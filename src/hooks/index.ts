/**
 * Claude Code hooks integration for crit
 *
 * Entry point for hook handlers that reads JSON from stdin and routes to appropriate handler.
 */

import type { PreToolInput, PostToolInput, PreToolOutput } from "./types";
import { handlePreTool } from "./pre-tool";
import { handlePostTool } from "./post-tool";

export { handlePreTool } from "./pre-tool";
export { handlePostTool } from "./post-tool";
export { installHooks, removeHooks, hooksInstalled } from "./install";
export type { PreToolInput, PostToolInput, PreToolOutput } from "./types";

/**
 * Read JSON input from stdin
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * Main hook entry point - reads stdin, routes to handler
 */
export async function handleHook(
  type: "pre-tool" | "post-tool"
): Promise<void> {
  try {
    const inputText = await readStdin();

    if (!inputText.trim()) {
      // No input, just approve for pre-tool or exit for post-tool
      if (type === "pre-tool") {
        const output: PreToolOutput = { decision: "approve" };
        console.log(JSON.stringify(output));
      }
      return;
    }

    const input = JSON.parse(inputText);

    if (type === "pre-tool") {
      const result = await handlePreTool(input as PreToolInput);
      console.log(JSON.stringify(result));
    } else {
      await handlePostTool(input as PostToolInput);
    }
  } catch (error) {
    // On any error, approve for pre-tool (don't block) and exit silently for post-tool
    if (type === "pre-tool") {
      const output: PreToolOutput = { decision: "approve" };
      console.log(JSON.stringify(output));
    }

    // Log error to stderr for debugging (won't affect Claude)
    console.error(`[crit hook error] ${error}`);
  }
}
