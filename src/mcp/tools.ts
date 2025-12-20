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
  // Criticism system tools
  {
    name: "crit_get_preferences",
    description:
      "Get user preferences for code changes. Returns patterns that were accepted or rejected, with user reasoning. Use this before suggesting changes to avoid repeating rejected patterns.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "crit_get_status",
    description:
      "Get current project status including deliverables, insights, and focus area. Use this to understand project context.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "crit_add_criticism",
    description:
      "Add a criticism (suggested improvement) for user review. The user will see this in the TUI and can accept/reject it. Categories: ELIM (remove unused code), SIMPLIFY (better patterns), TEST (add test coverage).",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["ELIM", "SIMPLIFY", "TEST"],
          description: "Type of criticism",
        },
        subject: {
          type: "string",
          description: "Short label for the issue (e.g., 'unused helper', 'complex parser')",
        },
        description: {
          type: "string",
          description: "Full explanation of the issue and why it should be addressed",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "List of files affected",
        },
        location: {
          type: "string",
          description: "Specific location (e.g., 'src/lib/utils.ts:42')",
        },
        severity: {
          type: "string",
          enum: ["low", "medium", "high"],
          description: "How important is this issue",
        },
        diff: {
          type: "string",
          description: "Optional: proposed change in unified diff format",
        },
      },
      required: ["category", "subject", "description", "files", "severity"],
    },
  },
  {
    name: "crit_get_criticisms",
    description:
      "Get pending criticisms awaiting user review. Returns list of suggested improvements.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["ELIM", "SIMPLIFY", "TEST"],
          description: "Optional: filter by category",
        },
      },
    },
  },
  {
    name: "crit_update_status",
    description:
      "Update project status. Use to add deliverables, insights, or change focus.",
    inputSchema: {
      type: "object",
      properties: {
        addDeliverable: {
          type: "string",
          description: "Add a new deliverable",
        },
        markDone: {
          type: "string",
          description: "Mark a deliverable as done",
        },
        addInsight: {
          type: "string",
          description: "Add a project insight",
        },
        setFocus: {
          type: "string",
          description: "Set current focus area",
        },
      },
    },
  },
  // Deep analysis tools
  {
    name: "crit_get_analysis_queue",
    description:
      "Get files queued for deep analysis. Returns file contents, related context, and web search results (Reddit/SO recommendations). Use this to find code that could be simplified or improved.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of files to return (default: 3)",
        },
      },
    },
  },
  {
    name: "crit_mark_analyzed",
    description:
      "Mark a file as analyzed (removes from queue). Call this after analyzing a file, whether or not you found issues.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "string",
          description: "File path that was analyzed",
        },
      },
      required: ["file"],
    },
  },
  {
    name: "crit_search_online",
    description:
      "Search Reddit and Stack Overflow for recommendations about a code pattern. Use this to find community consensus on best practices.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (e.g., 'typescript error handling pattern')",
        },
        language: {
          type: "string",
          description: "Programming language context (default: typescript)",
        },
      },
      required: ["query"],
    },
  },
];
