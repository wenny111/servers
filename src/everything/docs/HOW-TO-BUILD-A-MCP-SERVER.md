# HOW TO BUILD A MCP SERVER — 从零构建 MCP Server 模板

> 基于 `@modelcontextprotocol/server-everything` 的参考实现抽象而成。
> 本文档面向需要自己实现 MCP Server 的开发者。

---

## 目录

1. [项目初始化](#1-项目初始化)
2. [目录结构](#2-目录结构)
3. [Server 工厂模式](#3-server-工厂模式)
4. [编写第一个 Tool](#4-编写第一个-tool)
5. [编写 Resource](#5-编写-resource)
6. [编写 Prompt](#6-编写-prompt)
7. [配置 Transport 传输层](#7-配置-transport-传输层)
8. [高级特性](#8-高级特性)
9. [完整模板](#9-完整模板)

---

## 1. 项目初始化

```bash
mkdir my-mcp-server && cd my-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript @types/node vitest
```

**`tsconfig.json`（关键配置）：**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src/**/*"]
}
```

**`package.json` 关键字段：**
```json
{
  "type": "module",
  "bin": {
    "my-mcp-server": "dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch & node --watch dist/index.js"
  }
}
```

---

## 2. 目录结构

```
src/
├── index.ts                 # CLI 入口：选择 transport 启动
├── server/
│   └── index.ts             # Server 工厂：createServer()
├── tools/
│   ├── index.ts             # 工具注册汇总
│   ├── echo.ts              # 示例：最简单 Tool
│   └── my-tool.ts           # 你的业务 Tool
├── resources/
│   ├── index.ts             # 资源注册汇总
│   └── templates.ts         # 动态资源模板
├── prompts/
│   ├── index.ts             # Prompt 注册汇总
│   └── simple.ts            # Prompt 示例
├── transports/
│   ├── stdio.ts             # STDIO 传输
│   └── streamableHttp.ts    # Streamable HTTP 传输（推荐）
└── docs/
    └── instructions.md      # 给 LLM 看的服务说明
```

---

## 3. Server 工厂模式

这是整个 MCP Server 的核心入口，所有注册都在这里完成。

```ts
// src/server/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export type ServerFactoryResponse = {
  server: McpServer;
  cleanup: (sessionId?: string) => void;
};

export const createServer = (): ServerFactoryResponse => {
  // 1. 创建 Server 实例
  const server = new McpServer(
    { name: "my-server", version: "1.0.0" },
    {
      capabilities: {
        tools: {},                              // 支持工具调用
        resources: { subscribe: true },         // 支持资源 + 订阅
        prompts: {},                            // 支持 Prompt 模板
        logging: {},                            // 支持日志推送
      },
      instructions: loadInstructions(),          // 给 LLM 的指引
    }
  );

  // 2. 注册 Tools / Resources / Prompts
  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  // 3. 返回 server + cleanup
  return {
    server,
    cleanup: (sessionId?: string) => {
      // 清理定时器、缓存等
    },
  } satisfies ServerFactoryResponse;
};
```

---

## 4. 编写第一个 Tool

每个 Tool 遵循统一模式：**Schema 定义 → config 对象 → registerTool**

### 4.1 最简 Tool（无参数）

```ts
// src/tools/ping.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export const registerPingTool = (server: McpServer) => {
  server.registerTool(
    "ping",
    {
      title: "Ping Tool",
      description: "返回 pong",
      inputSchema: {},                                  // 无参数
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (): Promise<CallToolResult> => {
      return {
        content: [{ type: "text", text: "pong" }],
      };
    }
  );
};
```

### 4.2 带 Zod 参数校验的 Tool

```ts
// src/tools/calculate.ts
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const registerCalculateTool = (server: McpServer) => {
  server.registerTool(
    "calculate",
    {
      title: "Calculate Tool",
      description: "执行四则运算",
      inputSchema: {                                      // Zod schema
        operation: z.enum(["add", "subtract", "multiply", "divide"]),
        a: z.number(),
        b: z.number(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      const { operation, a, b } = args;
      let result: number;
      switch (operation) {
        case "add":      result = a + b; break;
        case "subtract": result = a - b; break;
        case "multiply": result = a * b; break;
        case "divide":   result = a / b; break;
      }
      return {
        content: [{ type: "text", text: `${a} ${operation} ${b} = ${result}` }],
      };
    }
  );
};
```

### 4.3 返回结构化输出

```ts
import { z } from "zod";

server.registerTool(
  "get-weather",
  {
    title: "Weather Tool",
    description: "获取天气",
    inputSchema: { city: z.string() },
    outputSchema: z.object({                           // ← 输出 schema
      temperature: z.number(),
      condition: z.string(),
    }),
    annotations: { ... },
  },
  async (args) => {
    const weather = { temperature: 22, condition: "晴朗" };
    return {
      content: [{ type: "text", text: JSON.stringify(weather) }],  // 兼容旧客户端
      structuredContent: weather,                                   // 结构化输出
    };
  }
);
```

### 4.4 返回不同类型 Content

```ts
// 文本
content: [{ type: "text", text: "Hello World" }]

// 图片（base64）
content: [{ type: "image", data: "iVBORw0KG...", mimeType: "image/png" }]

// 内嵌资源
content: [{
  type: "resource",
  resource: { uri: "my://data", mimeType: "text/plain", text: "data..." }
}]

// 资源引用（不内嵌数据，让客户端后续读取）
content: [{
  type: "resource_link",
  uri: "my://data/123",
  name: "Data 123",
  mimeType: "application/json"
}]

// 带注释的内容（可帮助 LLM 过滤）
content: [{
  type: "text",
  text: "错误日志...",
  annotations: { priority: 1.0, audience: ["assistant"] }
}]
```

### 4.5 注册汇总

```ts
// src/tools/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPingTool } from "./ping.js";
import { registerCalculateTool } from "./calculate.js";

export const registerTools = (server: McpServer) => {
  registerPingTool(server);
  registerCalculateTool(server);
  // 添加新 tool：import + 在这里调用
};
```

---

## 5. 编写 Resource

### 5.1 静态资源

```ts
// src/resources/static.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const registerStaticResources = (server: McpServer) => {
  server.registerResource(
    "config",
    "my://config",
    { mimeType: "application/json", description: "应用配置" },
    async (uri) => ({
      contents: [{
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify({ version: "1.0", debug: false }),
      }],
    })
  );
};
```

### 5.2 ResourceTemplate（动态 URI 参数）

```ts
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

server.registerResource(
  "User Profile",
  new ResourceTemplate("my://users/{userId}", { list: undefined }),
  { mimeType: "application/json", description: "用户信息" },
  async (uri, variables) => {
    const userId = variables.userId as string;
    return {
      contents: [{
        uri: uri.toString(),
        mimeType: "application/json",
        text: JSON.stringify({ id: userId, name: `User ${userId}` }),
      }],
    };
  }
);
```

### 5.3 带自动补全的 ResourceTemplate

```ts
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";

const userIdCompleter = completable(
  z.string().describe("用户 ID"),
  (value) => ["alice", "bob", "charlie"].filter(u => u.startsWith(value))
);

server.registerResource(
  "User Profile",
  new ResourceTemplate("my://users/{userId}", {
    list: undefined,
    complete: { userId: userIdCompleter },
  }),
  { ... },
  async (uri, variables) => { ... }
);
```

---

## 6. 编写 Prompt

### 6.1 无参 Prompt

```ts
server.registerPrompt(
  "greeting",
  {
    title: "Greeting Prompt",
    description: "简单的问候",
  },
  () => ({
    messages: [{
      role: "user",
      content: { type: "text", text: "你好！请帮我总结今天的天气。" },
    }],
  })
);
```

### 6.2 带参数的 Prompt

```ts
server.registerPrompt(
  "weather-query",
  {
    title: "Weather Prompt",
    description: "查询指定城市天气",
    argsSchema: {
      city: z.string().describe("城市名"),
      date: z.string().optional().describe("日期（可选）"),
    },
  },
  (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `${args.city}${args.date ? ` 在 ${args.date}` : ""}的天气如何？`,
      },
    }],
  })
);
```

### 6.3 带自动补全的 Prompt

```ts
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";

server.registerPrompt(
  "team-assign",
  {
    title: "Team Assignment",
    description: "分配团队成员",
    argsSchema: {
      department: completable(
        z.string().describe("部门"),
        (value) => ["Engineering", "Design", "Marketing"].filter(d => d.startsWith(value))
      ),
      member: completable(
        z.string().describe("成员"),
        (value, context) => {
          // context.arguments["department"] 可读取其他参数
          const dept = context?.arguments?.["department"];
          const members = { Engineering: ["Alice","Bob"], Design: ["Carol"] };
          return (members[dept] || []).filter(m => m.startsWith(value));
        }
      ),
    },
  },
  ({ department, member }) => ({
    messages: [{
      role: "user",
      content: { type: "text", text: `请将 ${member} 分配到 ${department} 部门。` },
    }],
  })
);
```

---

## 7. 配置 Transport 传输层

### 7.1 CLI 入口

```ts
// src/index.ts
#!/usr/bin/env node
const transport = process.argv[2] || "stdio";

async function main() {
  switch (transport) {
    case "stdio":
      await import("./transports/stdio.js");
      break;
    case "streamableHttp":
      await import("./transports/streamableHttp.js");
      break;
    default:
      console.error(`未知传输方式: ${transport}`);
      process.exit(1);
  }
}
main();
```

### 7.2 STDIO 传输（单进程，最简单）

```ts
// src/transports/stdio.ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "../server/index.js";

async function main() {
  const transport = new StdioServerTransport();
  const { server, cleanup } = createServer();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    cleanup();
    process.exit(0);
  });
}
main();
```

### 7.3 Streamable HTTP 传输（推荐，支持多客户端 + 断线重连）

```ts
// src/transports/streamableHttp.ts
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { createServer } from "../server/index.js";
import { randomUUID } from "node:crypto";

const app = express();
app.use(express.json());

const transports = new Map<string, StreamableHTTPServerTransport>();

// POST: JSON-RPC 消息处理
app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (sessionId && transports.has(sessionId)) {
    // 复用已有会话
    await transports.get(sessionId)!.handleRequest(req, res);
  } else if (!sessionId) {
    // 新会话
    const { server, cleanup } = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => transports.set(sid, transport),
    });
    server.server.onclose = () => {
      transports.delete(transport.sessionId!);
      cleanup(transport.sessionId);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: "无效 session" });
  }
});

// GET: SSE 流（含 Last-Event-ID 重连）
app.get("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports.get(sessionId);
  if (!transport) return res.status(400).json({ error: "会话不存在" });
  await transport.handleRequest(req, res);
});

// DELETE: 终止会话
app.delete("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string;
  const transport = transports.get(sessionId);
  if (!transport) return res.status(400).json({ error: "会话不存在" });
  await transport.handleRequest(req, res);
});

app.listen(3000, () => console.log("MCP Server running on port 3000"));
```

---

## 8. 高级特性

### 8.1 条件注册（根据客户端能力决定是否注册）

```ts
export const registerMyConditionalTool = (server: McpServer) => {
  const caps = server.server.getClientCapabilities() || {};
  if (caps.sampling !== undefined) {
    server.registerTool("my-sampling-tool", config, callback);
  }
};

// 在 oninitialized 中调用
server.server.oninitialized = async () => {
  registerMyConditionalTool(server);
};
```

### 8.2 向客户端发送日志

```ts
await server.sendLoggingMessage(
  { level: "info", data: "某个操作完成" },
  sessionId    // stdio 传 undefined
);
```

### 8.3 长运行操作 + 进度通知

```ts
server.registerTool("long-op", config, async (args, extra) => {
  const progressToken = extra._meta?.progressToken;

  for (let i = 1; i <= 10; i++) {
    await sleep(1000);
    if (progressToken !== undefined) {
      await server.server.notification({
        method: "notifications/progress",
        params: { progress: i, total: 10, progressToken },
      }, { relatedRequestId: extra.requestId });
    }
  }
  return { content: [{ type: "text", text: "完成" }] };
});
```

### 8.4 向客户端请求 LLM 采样（Sampling）

```ts
server.registerTool("ask-llm", config, async (args, extra) => {
  const caps = server.server.getClientCapabilities() || {};
  if (caps.sampling === undefined) throw new Error("客户端不支持 sampling");

  const result = await extra.sendRequest(
    {
      method: "sampling/createMessage",
      params: {
        messages: [{ role: "user", content: { type: "text", text: "你好" } }],
        maxTokens: 100,
      },
    },
    CreateMessageResultSchema    // 从 SDK types 导入
  );
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});
```

### 8.5 向用户发起交互提问（Elicitation）

```ts
const caps = server.server.getClientCapabilities() || {};
if (caps.elicitation === undefined) throw new Error("客户端不支持 elicitation");

const result = await extra.sendRequest(
  {
    method: "elicitation/create",
    params: {
      message: "请选择你喜欢的颜色：",
      requestedSchema: {
        type: "object",
        properties: {
          color: { type: "string", enum: ["红", "蓝", "绿"] },
        },
        required: ["color"],
      },
    },
  },
  ElicitResultSchema
);
```

### 8.6 资源订阅通知

```ts
// 1. 设置订阅处理器
server.server.setRequestHandler(SubscribeRequestSchema, async (req, extra) => {
  const { uri } = req.params;
  const sessionId = extra.sessionId as string;
  // 记录 uri → sessionId 的映射
  subscribers.set(uri, (subscribers.get(uri) || new Set()).add(sessionId));
  return {};
});

// 2. 发送更新通知
await server.server.notification({
  method: "notifications/resources/updated",
  params: { uri: "my://data/123" },
});
```

### 8.7 Tasks（实验性，异步长运行工具）

```ts
// 注册 task-based tool
server.experimental.tasks.registerToolTask(
  "my-task",
  {
    title: "My Task Tool",
    description: "异步长运行任务",
    inputSchema: { param: z.string() },
    annotations: { ... },
  },
  {
    taskCapabilities: { ttl: 600_000 },    // 10 分钟超时
    initialStatus: "working",
  },
  async (args, { taskStore }) => {
    // 更新状态
    await taskStore.updateTaskStatus(taskId, "working", "处理中...");
    // 执行业务逻辑
    await doWork();
    // 存储结果
    await taskStore.storeTaskResult(taskId, "completed", result);
  }
);
```

---

## 9. 完整模板

把以上内容整合为一个最小可运行的 MCP Server 模板：

### 目录
```
my-mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── server/
│   │   └── index.ts
│   ├── tools/
│   │   ├── index.ts
│   │   └── echo.ts
│   ├── resources/
│   │   ├── index.ts
│   │   └── static.ts
│   ├── prompts/
│   │   ├── index.ts
│   │   └── simple.ts
│   └── transports/
│       └── streamableHttp.ts
```

### `src/server/index.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerTools } from "../tools/index.js";
import { registerResources } from "../resources/index.js";
import { registerPrompts } from "../prompts/index.js";

export const createServer = () => {
  const server = new McpServer(
    { name: "my-server", version: "1.0.0" },
    {
      capabilities: {
        tools: {},
        resources: { subscribe: true },
        prompts: {},
        logging: {},
      },
      instructions: "这是一个示例 MCP Server。",
    }
  );

  registerTools(server);
  registerResources(server);
  registerPrompts(server);

  return {
    server,
    cleanup: (sessionId?: string) => {
      // 清理逻辑
    },
  };
};
```

### `src/tools/echo.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

export const registerEchoTool = (server: McpServer) => {
  server.registerTool(
    "echo",
    {
      title: "Echo",
      description: "回显输入",
      inputSchema: { message: z.string().describe("要回显的消息") },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args): Promise<CallToolResult> => ({
      content: [{ type: "text", text: `Echo: ${args.message}` }],
    })
  );
};
```

### `src/tools/index.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerEchoTool } from "./echo.js";

export const registerTools = (server: McpServer) => {
  registerEchoTool(server);
};
```

### `src/resources/static.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const registerStaticResources = (server: McpServer) => {
  server.registerResource(
    "about",
    "my://about",
    { mimeType: "text/plain", description: "关于信息" },
    async (uri) => ({
      contents: [{ uri: uri.toString(), mimeType: "text/plain", text: "My MCP Server v1.0" }],
    })
  );
};
```

### `src/resources/index.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStaticResources } from "./static.js";

export const registerResources = (server: McpServer) => {
  registerStaticResources(server);
};
```

### `src/prompts/simple.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export const registerSimplePrompt = (server: McpServer) => {
  server.registerPrompt(
    "greeting",
    { title: "问候", description: "简单问候语" },
    () => ({
      messages: [{
        role: "user",
        content: { type: "text", text: "你好！请简单介绍你自己。" },
      }],
    })
  );
};
```

### `src/prompts/index.ts`
```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSimplePrompt } from "./simple.js";

export const registerPrompts = (server: McpServer) => {
  registerSimplePrompt(server);
};
```

### `src/transports/streamableHttp.ts`
```ts
// 复制 7.3 节代码
```

### `src/index.ts`
```ts
#!/usr/bin/env node
const transport = process.argv[2] || "streamableHttp";
async function main() {
  switch (transport) {
    case "streamableHttp": await import("./transports/streamableHttp.js"); break;
    default: console.error(`未知传输: ${transport}`); process.exit(1);
  }
}
main();
```

---

## 开发流程速查

```
1. 创建新 Tool
   src/tools/my-tool.ts  →  写 registerXxxTool(server)
   src/tools/index.ts    →  添加 registerXxxTool(server)

2. 创建新 Resource
   src/resources/my-res.ts  →  用 server.registerResource(...)
   src/resources/index.ts   →  调用注册函数

3. 创建新 Prompt
   src/prompts/my-prompt.ts  →  用 server.registerPrompt(...)
   src/prompts/index.ts      →  调用注册函数

4. 构建 & 运行
   npm run build
   node dist/index.js streamableHttp

5. 测试
   用 MCP Inspector (npx @modelcontextprotocol/inspector)
   或直接在 Claude Desktop / VS Code 等客户端配置连接
```

---

## 关键 SDK 类型速查

| 类型 | 来源 | 用途 |
|------|------|------|
| `McpServer` | `@modelcontextprotocol/sdk/server/mcp.js` | 服务端主类 |
| `CallToolResult` | `@modelcontextprotocol/sdk/types.js` | Tool 返回值类型 |
| `ResourceTemplate` | `@modelcontextprotocol/sdk/server/mcp.js` | URI 模板资源 |
| `completable` | `@modelcontextprotocol/sdk/server/completable.js` | 自动补全包装器 |
| `StdioServerTransport` | `@modelcontextprotocol/sdk/server/stdio.js` | STDIO 传输 |
| `StreamableHTTPServerTransport` | `@modelcontextprotocol/sdk/server/streamableHttp.js` | HTTP 传输 |
| `CreateMessageResultSchema` | `@modelcontextprotocol/sdk/types.js` | Sampling 返回值校验 |
| `ElicitResultSchema` | `@modelcontextprotocol/sdk/types.js` | Elicitation 返回值校验 |
| `SubscribeRequestSchema` | `@modelcontextprotocol/sdk/types.js` | 资源订阅请求校验 |
| `InMemoryTaskStore` | `@modelcontextprotocol/sdk/experimental/tasks` | 内存任务存储 |
