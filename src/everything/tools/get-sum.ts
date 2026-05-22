import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// @LEARN: 带数值入参的 Tool — Zod schema 同时承担校验和文档两种职责
// Tool input schema
// 校验客户端传给工具的参数, 跟 LLM 无关
const GetSumSchema = z.object({
  a: z.number().describe("First number"),
  b: z.number().describe("Second number"),
});

// Tool configuration
const name = "get-sum";
const config = {
  title: "Get Sum Tool",
  description: "Returns the sum of two numbers",
  inputSchema: GetSumSchema,
  // 不是定义工具属性， 是给客户端/LLM 的"行为提示"，帮助客户端优化调度
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

/**
 * Registers the 'get-sum' tool.
 **
 * The registered tool processes input arguments, validates them using a predefined schema,
 * calculates the sum of two numeric values, and returns the result in a content block.
 *
 * Expects input arguments to conform to a specific schema that includes two numeric properties, `a` and `b`.
 * Validation is performed to ensure the input adheres to the expected structure before calculating the sum.
 *
 * The result is returned as a Promise resolving to an object containing the computed sum in a text format.
 *
 * @param {McpServer} server - The McpServer instance where the tool will be registered.
 */
export const registerGetSumTool = (server: McpServer) => {
  server.registerTool(name, config, async (args): Promise<CallToolResult> => {
    const validatedArgs = GetSumSchema.parse(args);
    // LLM 负责决策(调用xxx工具)，代码负责执行
    const sum = validatedArgs.a + validatedArgs.b;
    return {
      content: [
        {
          type: "text",
          text: `The sum of ${validatedArgs.a} and ${validatedArgs.b} is ${sum}.`,
        },
      ],
    };
  });
};
