import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register a simple prompt with no arguments
 * - Returns the fixed text of the prompt with no modifications
 *
 * @param server
 */
 // @LEARN: 最简单的 Prompt 定义 — 无参数，固定返回一段文本消息
export const registerSimplePrompt = (server: McpServer) => {
  // Register the prompt
  server.registerPrompt(
    "simple-prompt",
    {
      title: "Simple Prompt",
      description: "A prompt with no arguments",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "This is a simple prompt without arguments.",
          },
        },
      ],
    })
  );
};
