import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createServer } from "../server/index.js";
import cors from "cors";

console.error("Starting SSE server...");

// @CORE: SSE (Server-Sent Events) 传输 — 基于 HTTP 长连接，支持多会话
// @LEARN: 每个客户端连接对应一个独立的 sessionId → transport 映射
// Express app with permissive CORS for testing with Inspector direct connect mode
const app = express();
app.use(
  cors({
    origin: "*", // use "*" with caution in production
    methods: "GET,POST",
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);

// Map sessionId to transport for each client
const transports: Map<string, SSEServerTransport> = new Map<
  string,
  SSEServerTransport
>();

// @CORE: GET /sse — 客户端建立 SSE 连接，创建新会话
app.get("/sse", async (req, res) => {
  let transport: SSEServerTransport;
  const { server, cleanup } = createServer();

  // Session Id should not exist for GET /sse requests
  if (req?.query?.sessionId) {
    const sessionId = req?.query?.sessionId as string;
    transport = transports.get(sessionId) as SSEServerTransport;
    console.error(
      "Client Reconnecting? This shouldn't happen; when client has a sessionId, GET /sse should not be called again.",
      transport.sessionId
    );
  } else {
    // Create and store transport for the new session
    transport = new SSEServerTransport("/message", res);
    transports.set(transport.sessionId, transport);

    // Connect server to transport
    await server.connect(transport);
    const sessionId = transport.sessionId;
    console.error("Client Connected: ", sessionId);

    // SSE — 每个客户端断连清一次：
    // Handle close of connection
    server.server.onclose = async () => {
      const sessionId = transport.sessionId;
      console.error("Client Disconnected: ", sessionId);
      transports.delete(sessionId);
      cleanup(sessionId);
    };
  }
});

// @CORE: POST /message — 客户端发送 JSON-RPC 消息到指定会话
app.post("/message", async (req, res) => {
  // Session Id should exist for POST /message requests
  const sessionId = req?.query?.sessionId as string;

  // Get the transport for this session and use it to handle the request
  const transport = transports.get(sessionId);
  if (transport) {
    console.error("Client Message from", sessionId);
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`No transport found for sessionId ${sessionId}`);
  }
});

// Start the express server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.error(`Server is running on port ${PORT}`);
});
