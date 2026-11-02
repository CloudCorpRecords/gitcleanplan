/**
 * gitcleanplan MCP server. Tools: plan_branch_cleanup.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The planning is pure local computation: no upstream API,
 * no authentication, no configuration, and nothing is ever
 * executed or deleted — the tool only lists commands.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { formatPayload, planBranchCleanup, VERSION } from "./gitcleanplan.js";

const TOOLS = [
  {
    name: "plan_branch_cleanup",
    description:
      "Plan stale and merged branch cleanup from branch data: a keep / review / delete decision with a reason per branch, plus the delete commands. Lists only; deletes nothing.",
    inputSchema: {
      type: "object" as const,
      properties: {
        branches: {
          type: "array",
          description: "Branches to plan for (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Branch name (unique across the set)" },
              merged: {
                type: "boolean",
                description:
                  "True when the branch is merged into the default branch (optional, default false)",
              },
              last_commit_days_ago: {
                type: "integer",
                description: "Whole days since the branch's last commit (at least 0)",
              },
              upstream_gone: {
                type: "boolean",
                description: "True when the branch's upstream is gone (optional, default false)",
              },
              protected: {
                type: "boolean",
                description: "True for protected branches (optional, default false)",
              },
              current: {
                type: "boolean",
                description:
                  "True for the currently checked-out branch (optional, default false)",
              },
            },
            required: ["name", "last_commit_days_ago"],
          },
        },
        stale_days: {
          type: "integer",
          description:
            "A branch is stale at this many days since its last commit (optional, default 90)",
        },
        default_branch: {
          type: "string",
          description:
            "Default branch name; it is never planned for deletion (optional, default \"main\")",
        },
      },
      required: ["branches"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "gitcleanplan", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "plan_branch_cleanup") {
      out = planBranchCleanup(args ?? {});
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
