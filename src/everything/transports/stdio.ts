#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server/index.js";

console.error("Starting default (STDIO) server...");

/**
 * The main method
 * - Initializes the StdioServerTransport, sets up the server,
 * - Handles cleanup on process exit.
 *
 * @return {Promise<void>} A promise that resolves when the main function has executed and the process exits.
 */
 // @CORE: STDIO 传输 — 通过标准输入/输出与客户端通信，是最简单的 MCP 传输方式
 // @LEARN: 进程通过 SIGINT 信号进行优雅关闭
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  const { server, cleanup } = createServer();

  // Connect transport to server
  await server.connect(transport);

  // STDIO — 进程级，只清一次：
  // Cleanup on exit
  process.on("SIGINT", async () => {
    await server.close();
    cleanup();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
