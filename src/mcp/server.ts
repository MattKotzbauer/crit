#!/usr/bin/env bun
/**
 * MCP Server for crit
 *
 * Provides tools for Claude to interact with crit's rules, context, and state.
 *
 * Usage:
 *   CRIT_PROJECT=/path/to/project bun run src/mcp/server.ts
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { tools } from "./tools";
import {
  handleGetContext,
  handleCheckRules,
  handleLogAction,
  handleAddInitiative,
  handleUpdateContext,
  handleGetOverview,
  handleCheckBloat,
  handleCheckProposedCode,
  handleCheckTests,
  type CheckRulesInput,
  type LogActionInput,
  type AddInitiativeInput,
  type UpdateContextInput,
  type GetOverviewInput,
  type CheckBloatInput,
  type CheckProposedCodeInput,
  type CheckTestsInput,
} from "./handlers";

// Create server
const server = new Server(
  {
    name: "crit",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
});

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "crit_get_context": {
        const result = await handleGetContext();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_check_rules": {
        const input = args as unknown as CheckRulesInput;
        if (!input.description) {
          throw new Error("description is required");
        }
        const result = await handleCheckRules(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_log_action": {
        const input = args as unknown as LogActionInput;
        if (!input.action || !input.description || !input.files) {
          throw new Error("action, description, and files are required");
        }
        const result = await handleLogAction(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_add_initiative": {
        const input = args as unknown as AddInitiativeInput;
        if (!input.type || !input.description || !input.priority) {
          throw new Error("type, description, and priority are required");
        }
        const result = await handleAddInitiative(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_update_context": {
        const input = args as unknown as UpdateContextInput;
        if (!input.file || !input.content) {
          throw new Error("file and content are required");
        }
        const result = await handleUpdateContext(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_get_overview": {
        const input = (args || {}) as unknown as GetOverviewInput;
        const result = await handleGetOverview(input);
        return {
          content: [
            {
              type: "text",
              text: result.overview,
            },
          ],
        };
      }

      case "crit_check_bloat": {
        const input = (args || {}) as unknown as CheckBloatInput;
        const result = await handleCheckBloat(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_check_proposed_code": {
        const input = args as unknown as CheckProposedCodeInput;
        if (!input.code || !input.context) {
          throw new Error("code and context are required");
        }
        const result = await handleCheckProposedCode(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "crit_check_tests": {
        const input = (args || {}) as unknown as CheckTestsInput;
        const result = await handleCheckTests(input);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: message }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Crit MCP server started");
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
