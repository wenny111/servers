import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// Tool configuration
const name = "get-env";
const config = {
  title: "Print Environment Tool",
  description:
    "Returns all environment variables, helpful for debugging MCP server configuration",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-env' tool.
 *
 * The registered tool Retrieves and returns the environment variables
 * of the current process as a JSON-formatted string encapsulated in a text response.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
 // @LEARN: 不需要输入 schema 的 Tool — inputSchema: {} 即可
 // @LEARN: 直接返回 process.env 可用来调试 MCP Server 的环境配置
export const registerGetEnvTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(process.env, null, 2),
        },
      ],
    };
  });
};
