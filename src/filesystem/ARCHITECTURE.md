# Filesystem Server 架构说明

本文概述 `@modelcontextprotocol/server-filesystem` 的结构、主流程，以及为什么它会这样设计。

## 概览

这个 filesystem server 是一个基于 stdio 的 MCP server。它把文件系统能力暴露成 MCP tools，同时用严格的目录白名单控制访问边界。

整个实现围绕 3 个核心目标展开：

1. 协议接入：注册 MCP tools、定义 schema、通过 stdio 与客户端通信。
2. 文件能力：实现读、写、搜索、移动、查看元数据等操作。
3. 安全边界：确保所有操作都限制在允许目录内，并处理 symlink 带来的越界风险。

## 项目结构

- `index.ts`
  - 服务入口
  - 解析启动参数
  - 定义 tool 的输入 schema
  - 注册 MCP tools
  - 处理 MCP Roots 更新
  - 启动 stdio transport
- `lib.ts`
  - 核心文件系统能力
  - 共享访问控制状态
  - 统一路径校验入口
  - 读写、编辑、搜索等辅助函数
- `path-validation.ts`
  - 最底层的白名单判断
  - 判断某个路径是否位于允许目录内
- `path-utils.ts`
  - 处理跨平台路径规范化和 `~` 展开
- `roots-utils.ts`
  - 把 MCP Roots 转换成可用的本地目录

## 核心模块职责

### `index.ts`

`index.ts` 是协议装配层。它负责创建 `McpServer`、定义 Zod schema、注册 tools、监听 Roots 相关事件，并最终启动服务。

它刻意只做编排，不承载太多文件系统细节。这样 MCP 对外接口更清晰，后续加新 tool 也更容易。

### `lib.ts`

`lib.ts` 是能力实现层。大多数 tools 都遵循同一条主链路：

1. 校验输入路径。
2. 执行文件系统操作。
3. 封装成 MCP 友好的返回结果。

这里最关键的函数是 `validatePath()`，因为所有 tools 都依赖它来统一执行访问控制。

### `path-validation.ts`

这个模块负责最核心的安全判断：一个规范化后的绝对路径，是否等于或位于某个允许目录之下。

把它单独拆出来的好处是：安全规则更容易推理、复用和测试。

### `path-utils.ts`

这个模块负责统一不同平台上的路径语义。它会处理 Unix 路径、Windows 盘符路径、UNC 路径、WSL 路径、引号、多余分隔符和 `~`。

这样做是为了防止平台差异渗透到业务逻辑里，或者让路径校验失效。

### `roots-utils.ts`

这个模块把 MCP Roots 转成经过验证的本地目录。它支持 `file://` URI 和普通路径，最终只保留真实存在且是目录的路径。

这样客户端就可以在运行时定义 server 的访问边界。

## 数据流

### 1. 启动流程

`process.argv` -> 规范化/解析目录 -> 过滤可访问目录 -> `setAllowedDirectories()` -> 创建 server -> 注册 tools -> 连接 stdio transport

服务既可以在启动时通过命令行拿到允许目录，也可以先以空白名单启动，等待客户端稍后通过 Roots 下发目录。

### 2. Tool 调用流程

MCP tool request -> Zod schema 校验 -> tool handler -> `validatePath()` -> `lib.ts` 中的文件系统函数 -> `content` / `structuredContent` 响应

这条链路把协议校验、权限判断和业务逻辑清楚地拆开了。

### 3. Roots 更新流程

客户端初始化并声明支持 Roots -> server 调用 `listRoots()` -> `getValidRootDirectories()` -> 替换当前允许目录

运行时则是：

`roots/list_changed` 通知 -> server 拉取最新 roots -> 替换当前允许目录

这里选择“替换”而不是“合并”，是为了让 server 的访问边界始终和客户端当前工作区保持一致。

## 调用链

### 服务启动

1. 在 `index.ts` 中解析启动参数
2. 规范化并过滤允许目录
3. 把这份状态注入 `lib.ts`
4. 创建 `McpServer`
5. 注册 tools
6. 注册 Roots 事件处理
7. 连接 `StdioServerTransport`

### 典型读工具

1. 客户端调用 `read_text_file`
2. MCP 按 Zod schema 校验输入
3. handler 调用 `validatePath()`
4. handler 调用 `readFileContent()`、`headFile()` 或 `tailFile()`
5. server 返回文本结果和结构化结果

### 典型写工具

1. 客户端调用 `write_file`
2. handler 调用 `validatePath()`
3. `writeFileContent()` 以更安全的方式写入文件
4. server 返回成功消息

### 搜索工具

1. 客户端调用 `search_files`
2. handler 先校验根目录
3. `searchFilesWithValidation()` 递归遍历目录树
4. 每个候选路径都会再次校验
5. 返回匹配结果

## 关键抽象

### Allowed Directories

允许目录列表是这个 server 最核心的运行时状态。它定义了所有文件操作的安全边界，并且可以被 MCP Roots 动态替换。

### `validatePath()`

这是最重要的授权网关。它负责展开相对路径、规范化路径、检查白名单边界、解析 symlink，并在新建文件场景下校验父目录。

如果要新增 filesystem tool，通常都应该先经过 `validatePath()`。

### Zod Schemas

每个 tool 都有 schema 支撑的输入契约。这样既提升了 MCP 互操作性，也让参数结构对客户端和模型都更清晰。

### `content` 与 `structuredContent`

tool 返回值同时面向 LLM 和 MCP 客户端。文本结果更适合模型阅读，结构化结果更适合客户端做后续处理。

## 使用到的 API 与库

- MCP SDK
  - `McpServer`
  - `server.registerTool(...)`
  - `server.server.oninitialized`
  - `server.server.setNotificationHandler(...)`
  - `server.server.listRoots()`
  - `StdioServerTransport`
- Zod
  - `z.object(...)`
  - `z.string()`
  - `z.array(...)`
  - `z.enum(...)`
- Node.js
  - `fs/promises`
  - `createReadStream`
  - `path`
- 工具库
  - `minimatch`
  - `diff`

## 设计说明

### 为什么要分离协议层和文件系统逻辑？

因为不同 server 的 MCP 接入方式可能相似，但业务逻辑应该保持可复用、可测试。`index.ts` 负责协议装配，`lib.ts` 负责能力实现，这样职责更清晰。

### 为什么要集中做路径校验？

因为 filesystem server 是高风险类型的 MCP server。统一的校验入口更容易审计，也更不容易被单个 tool 漏掉。

### 为什么要支持 Roots？

因为在编辑器集成场景里，访问边界通常属于客户端上下文，而不只是服务启动参数。Roots 允许 server 跟随客户端当前工作区动态调整权限范围。

### 为什么要同时返回纯文本和结构化结果？

因为 MCP tools 同时服务两类消费者：LLM 和 MCP-aware 客户端。返回两种形式，能让 server 在不同接入场景下都更好用。

## 对写其他 MCP Server 的启发

这个实现很适合作为参考模板，尤其适合学习：

- 保持 MCP 协议层足够薄
- 把业务逻辑收敛到可复用模块
- 用 schema 定义 tool 输入契约
- 把授权与访问控制作为一等公民
- 用客户端提供的上下文来塑造 server 行为
