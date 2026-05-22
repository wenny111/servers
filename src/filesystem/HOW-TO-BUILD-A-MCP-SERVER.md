# 如何基于这个实现写一个 MCP Server

本文把 `src/filesystem/` 的实现抽象成一个可复用模板，帮助你从零搭一个自己的 MCP server。

重点不是“照抄 filesystem 功能”，而是学习它的结构、边界和主流程。

## 1. 先想清楚 4 个问题

在开始写代码前，先回答下面 4 个问题：

1. 你的 server 要暴露什么能力？
2. 这些能力是 tool、resource，还是 prompt？
3. 哪些输入是不可信的，需要统一校验？
4. 服务运行时是否依赖某种上下文，比如 workspace、roots、token、project、tenant？

如果这 4 个问题没有想清楚，代码很容易写成“能跑，但后面难扩展”的样子。

## 2. 推荐的目录结构

一个最小但可维护的 MCP server，建议至少拆成下面几层：

- `index.ts`
  - 入口文件
  - 创建 `McpServer`
  - 定义 schema
  - 注册 tools
  - 启动 transport
- `lib.ts`
  - 核心业务逻辑
  - 尽量不要直接依赖 MCP SDK 细节
- `validation.ts`
  - 输入校验、权限校验、边界校验
- `context.ts` 或 `state.ts`
  - 保存运行时上下文
  - 例如当前 workspace、roots、认证信息、缓存
- `README.md` / `ARCHITECTURE.md`
  - 对外说明能力和内部结构

如果 server 很简单，`validation.ts` 和 `state.ts` 也可以先并入 `lib.ts`，但脑中最好仍然保留这几层。

## 3. 推荐的分层方式

建议把代码按下面 4 层理解：

### 1. 协议层

负责和 MCP SDK 打交道：

- 创建 `McpServer`
- 注册 `tool`
- 处理 `initialize`
- 绑定通知和生命周期事件
- 启动 `StdioServerTransport`

这层最好只做“装配”，不要承载太多业务细节。

### 2. 业务层

负责真正的能力实现：

- 读写数据
- 调第三方 API
- 执行业务逻辑
- 返回业务结果

这层尽量别写太多 MCP 协议细节，方便复用和测试。

### 3. 校验层

负责所有不可信输入的统一收口：

- schema 校验
- 权限判断
- 参数归一化
- 安全边界检查

如果你的 server 有风险操作，这层一定不要散落在各个 handler 里。

### 4. 运行时上下文层

负责保存会变化的上下文：

- 当前 roots
- 当前 project
- 用户 token
- 租户信息
- 缓存

filesystem server 里的 `allowedDirectories` 就属于这一层。

## 4. 一个推荐的主流程

大多数 MCP server 都可以按下面这个主流程来组织：

1. 准备运行时上下文
2. 创建 `McpServer`
3. 定义每个 tool 的输入 schema
4. 为每个 tool 写 handler
5. 在 handler 里先校验，再调业务函数
6. 把结果封装成 MCP 返回值
7. 启动 transport

可以把它记成一句话：

**先定义边界，再暴露能力。**

## 5. 推荐的代码骨架

下面是一份通用骨架：

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { doBusiness, setRuntimeState } from "./lib.js";

const server = new McpServer({
  name: "my-server",
  version: "0.1.0",
});

const MyToolArgsSchema = z.object({
  input: z.string(),
});

server.registerTool(
  "my_tool",
  {
    title: "My Tool",
    description: "Do one focused thing.",
    inputSchema: MyToolArgsSchema.shape,
    annotations: { readOnlyHint: true },
  },
  async (args) => {
    const result = await doBusiness(args.input);
    return {
      content: [{ type: "text", text: result }],
      structuredContent: { result },
    };
  }
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

runServer().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
```

这只是最小骨架。真正可维护的 server，通常还要再加上统一校验和运行时状态。

## 6. 从 filesystem server 应该学什么

### 1. schema 先行

filesystem server 在 `index.ts` 里先定义所有 Zod schema，再注册 tool。

这样做的好处是：

- tool 输入契约很清晰
- 客户端更容易展示参数结构
- 模型调用时更稳定
- handler 里少写很多重复校验

结论：**把 schema 当成 API 契约，不要当成附属品。**

### 2. 统一校验入口

filesystem server 的核心不是某个 `readFile`，而是 `validatePath()`。

这类统一校验入口非常关键，因为它能把：

- 权限控制
- 输入归一化
- 风险边界
- 平台差异

全部收敛到一个地方。

结论：**你的 server 也应该尽早找出自己的 `validatePath()`。**

对于不同类型的 server，它可能是：

- `validateProjectId()`
- `validateWorkspaceAccess()`
- `validateToken()`
- `validateTenantScope()`
- `validateQueryShape()`

### 3. 协议层不要太厚

filesystem server 的 `index.ts` 负责：

- schema
- tool 注册
- 生命周期
- Roots
- 启动

真正的文件逻辑都放在 `lib.ts`。

这是很值得学的分工方式。否则 `index.ts` 很快就会变成一个巨大的、很难维护的 handler 集合。

结论：**入口文件负责装配，不负责堆业务。**

### 4. 运行时上下文要可替换

filesystem server 不是把目录权限写死，而是允许 Roots 在运行时替换 `allowedDirectories`。

这说明一个 MCP server 不只是静态命令集合，它往往还需要感知客户端上下文。

如果你的 server 面向编辑器、IDE、工作区、项目空间，这一点尤其重要。

结论：**要提前区分“启动配置”和“运行时上下文”。**

### 5. 返回值要同时考虑模型和客户端

filesystem server 经常同时返回：

- `content`
- `structuredContent`

这不是重复，而是在服务两类消费者：

- 模型更适合吃文本
- 客户端更适合吃结构化结果

结论：**如果结果天然有结构，尽量同时返回结构化内容。**

## 7. 设计一个新 MCP server 的步骤模板

可以直接按下面顺序做：

### 第一步：定义 server 的职责边界

先写一句话：

> 这个 server 负责什么，不负责什么。

例如：

- 负责把公司内部文档检索能力暴露成 tools
- 不负责用户认证登录流程本身

这个边界越清楚，后面越不容易把 server 做成“大杂烩”。

### 第二步：列出能力清单

把能力分成几类：

- 只读能力
- 写能力
- 高风险能力
- 依赖上下文的能力

这一步会直接影响后面的 `annotations`、校验策略和文档写法。

### 第三步：设计输入契约

为每个 tool 定义 schema：

- 输入字段
- 是否可选
- 默认值
- 枚举值
- 字段含义

这一步最好在写 handler 前完成。

### 第四步：抽出统一校验

先想哪些规则是所有 tools 共享的：

- 权限
- 参数合法性
- 资源存在性
- 租户边界
- 当前上下文是否可用

这类规则尽量抽成一个统一函数或统一模块。

### 第五步：写业务函数

业务函数尽量做到：

- 输入明确
- 输出稳定
- 不直接依赖 MCP transport
- 可以单独测试

### 第六步：写 tool handler

handler 推荐保持很薄：

1. 收 args
2. 调统一校验
3. 调业务函数
4. 包装返回结果

如果一个 handler 写得太厚，通常说明业务逻辑没有收敛好。

### 第七步：接入运行时上下文

如果 server 依赖客户端上下文，就像 filesystem server 依赖 Roots 一样，需要把：

- 初始化获取上下文
- 运行时更新上下文
- 上下文失效后的兜底行为

在设计时一次想清楚。

### 第八步：补文档和测试

至少要补两类文档：

- `README.md`：给使用者
- `ARCHITECTURE.md`：给维护者

测试建议优先覆盖：

- 输入边界
- 权限边界
- 主路径
- 失败路径

## 8. tool 设计建议

### 工具名要动词优先

例如：

- `read_document`
- `search_issues`
- `create_ticket`
- `list_projects`

不要起成过于抽象的名词。

### 一个 tool 尽量只做一件事

如果一个 tool 同时负责：

- 查数据
- 改状态
- 触发副作用

模型更容易误用，客户端也更难展示。

### 给 tool 加 annotations

像 filesystem server 一样，尽量明确：

- `readOnlyHint`
- `idempotentHint`
- `destructiveHint`

这样客户端和模型都更容易理解风险。

## 9. 什么时候要像 filesystem server 一样重点做安全边界

下面这些类型的 server，尤其需要学习 filesystem 的做法：

- 文件系统访问
- 数据库写入
- shell / command 执行
- 仓库修改
- 工单/发布/审批流操作
- 多租户后台系统

因为这类 server 一旦把边界处理松了，后果通常不是“小 bug”，而是越权、误写、误删或大面积副作用。

## 10. 一个简单的检查清单

在你准备发布自己的 MCP server 前，至少检查这些问题：

- tool 输入是否都有明确 schema
- handler 是否足够薄
- 是否存在统一校验入口
- 运行时上下文是否有明确来源
- 客户端上下文变化时，server 是否能正确更新
- 高风险 tool 是否设置了合适的 annotations
- 返回值是否同时考虑了模型和客户端
- README 是否讲清了接入方式
- ARCHITECTURE 是否讲清了结构和主流程

## 11. 最后记住一句话

写 MCP server 时，真正决定可维护性的，通常不是“tool 多不多”，而是下面三件事：

1. 边界有没有先想清楚
2. 校验有没有统一收口
3. 协议层和业务层有没有分开

filesystem server 值得学习的，正是这三点。
