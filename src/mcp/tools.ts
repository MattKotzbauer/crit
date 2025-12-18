/**
 * MCP Tool definitions for crit
 */

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const tools: ToolDefinition[] = [
  {
    name: "crit_get_context",
    description:
      "Get rules and context for Claude. Returns the current rules, context documentation, and recent history.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "crit_check_rules",
    description:
      "Check if a planned action complies with project rules. Returns suggestions for alignment.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Description of the planned action or code change",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "crit_log_action",
    description: "Log an action taken by Claude for history tracking.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Type of action: simplify, fix, update_docs, apply_rule, suggest",
        },
        description: {
          type: "string",
          description: "Description of what was done",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "List of files affected",
        },
      },
      required: ["action", "description", "files"],
    },
  },
  {
    name: "crit_add_initiative",
    description:
      "Queue an autonomous action for later execution or user approval.",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description: "Type of initiative: simplify, fix, cleanup, suggest",
        },
        description: {
          type: "string",
          description: "Description of the proposed action",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "Priority level",
        },
      },
      required: ["type", "description", "priority"],
    },
  },
  {
    name: "crit_update_context",
    description: "Update a context documentation file.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description:
            "Name of the context file to update (e.g., 'architecture.md')",
        },
        content: {
          type: "string",
          description: "New content for the file",
        },
      },
      required: ["file", "content"],
    },
  },
  {
    name: "crit_get_overview",
    description:
      "Get a technical overview of the project structure, modules, exports, and dependencies. Returns a concise but accurate summary with code references.",
    inputSchema: {
      type: "object",
      properties: {
        format: {
          type: "string",
          enum: ["full", "llm", "structure"],
          description:
            "Output format: 'full' for complete overview, 'llm' for concise LLM context, 'structure' for just the ASCII tree",
        },
      },
    },
  },
  {
    name: "crit_check_bloat",
    description:
      "Check for code bloat, over-engineering, and unnecessary complexity. Analyzes the entire project or a specific file.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description:
            "Optional: specific file to analyze. If not provided, analyzes entire project.",
        },
      },
    },
  },
  {
    name: "crit_check_proposed_code",
    description:
      "Check if proposed code is over-engineered and suggest simplifications.",
    inputSchema: {
      type: "object",
      properties: {
        code: {
          type: "string",
          description: "The code to check",
        },
        context: {
          type: "string",
          description:
            "Context about what this code is meant to do (helps determine if it's over-engineered)",
        },
      },
      required: ["code", "context"],
    },
  },
  {
    name: "crit_check_tests",
    description:
      "Check test coverage status for files. Returns information about which files have tests and which need them.",
    inputSchema: {
      type: "object",
      properties: {
        files: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional list of specific files to check. If not provided, checks entire project.",
        },
        verify: {
          type: "boolean",
          description: "If true, also run tests and verify they pass",
        },
      },
    },
  },
];
