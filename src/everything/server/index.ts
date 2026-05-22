import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  InMemoryTaskStore,
  InMemoryTaskMessageQueue,
} from "@modelcontextprotocol/sdk/experimental/tasks";
import {
  setSubscriptionHandlers,
  stopSimulatedResourceUpdates,
} from "../resources/subscriptions.js";
import { registerConditionalTools, registerTools } from "../tools/index.js";
import { registerResources, readInstructions } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";
import { stopSimulatedLogging } from "./logging.js";
import { syncRoots } from "./roots.js";

// @DATA: ServerFactoryResponse — MCP Server 实例 + 会话清理函数
export type ServerFactoryResponse = {
  server: McpServer;
  cleanup: (sessionId?: string) => void;
};

/**
 * Server Factory
 *
 * This function initializes a `McpServer` with specific capabilities and instructions,
 * registers tools, resources, and prompts, and configures resource subscription handlers.
 *
 * @returns {ServerFactoryResponse} An object containing the server instance, and a `cleanup`
 * function for handling server-side cleanup when a session ends.
 *
 * Properties of the returned object:
 * - `server` {Object}: The initialized server instance.
 * - `cleanup` {Function}: Function to perform cleanup operations for a closing session.
 */
 // @CORE: 工厂函数：创建 MCP Server，注册 tools/resources/prompts，配置 capability
export const createServer: () => ServerFactoryResponse = () => {
  // Read the server instructions
  const instructions = readInstructions();

  // Create task store and message queue for task support 异步任务
  const taskStore = new InMemoryTaskStore();
  const taskMessageQueue = new InMemoryTaskMessageQueue();

  let initializeTimeout: NodeJS.Timeout | null = null;

  // @CORE: 创建 MCP Server — 声明所有支持的 capability
  // @DATA: capabilities 声明了 tools/prompts/resources/logging/tasks 全套 MCP 协议能力
  const server = new McpServer(
    {
      name: "mcp-servers/everything",
      title: "Everything Reference Server",
      version: "2.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
        resources: {
          subscribe: true,
          listChanged: true,
        },
        logging: {},
        tasks: {
          list: {},
          cancel: {},
          requests: {
            tools: {
              call: {},
            },
          },
        },
      },
      instructions,
      taskStore,
      taskMessageQueue,
    }
  );

  // Register the tools
  registerTools(server);

  // Register the resources
  registerResources(server);

  // Register the prompts
  registerPrompts(server);

  // Set resource subscription handlers
  setSubscriptionHandlers(server);

  // @CORE: 初始化后回调 — 注册条件工具 + 同步 Roots
  // @LEARN: 部分工具需要等 client capability 确认后才能注册（sampling/elicitation/roots）
  server.server.oninitialized = async () => {
    // Register conditional tools now that client capabilities are known.
    // This finishes before the `notifications/initialized` handler finishes.
    registerConditionalTools(server);

    // Sync roots if the client supports them.
    // This is delayed until after the `notifications/initialized` handler finishes,
    // otherwise, the request gets lost.
    const sessionId = server.server.transport?.sessionId;
    initializeTimeout = setTimeout(() => syncRoots(server, sessionId), 350);
  };

  // Return the ServerFactoryResponse
  return {
    server,
    // 各 Transport 的清理时机不同，调用方负责清理
    cleanup: (sessionId?: string) => {
      // @CORE: 会话清理 — 停止模拟日志、资源更新、清除定时器
      stopSimulatedLogging(sessionId);
      stopSimulatedResourceUpdates(sessionId);
      // Clean up task store timers
      taskStore.cleanup();
      if (initializeTimeout) clearTimeout(initializeTimeout);
    },
  } satisfies ServerFactoryResponse;
};
