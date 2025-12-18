/**
 * Types for Claude Code hook integration
 */

export interface PreToolInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

export interface PreToolOutput {
  decision: "approve" | "block";
  reason?: string;
}

export interface PostToolInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: unknown;
}

// Extended history action types for hooks
export type HookAction =
  | "file_write"
  | "file_edit"
  | "test_run"
  | "bash_command"
  | "tool_use";
