import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// @LEARN: 最简单的 MCP Tool 写法 — 用 Zod 定义入参 schema，实现回调函数即可
// Tool input schema
export const EchoSchema = z.object({
  message: z.string().describe("Message to echo"),
});

// @DATA: 工具元数据 — annotations 描述工具行为（只读/幂等/非破坏性），供客户端优化调用策略
const name = "echo";
const config = {
  title: "Echo Tool",
  description: "Echoes back the input string",
  inputSchema: EchoSchema,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'echo' tool.
 *
 * The registered tool validates input arguments using the EchoSchema and
 * returns a response that echoes the message provided in the arguments.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 * @returns {void}
 */
export const registerEchoTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = EchoSchema.parse(args);
    return {
      content: [{ type: "text", text: `Echo: ${validatedArgs.message}` }],
    };
  });
};
