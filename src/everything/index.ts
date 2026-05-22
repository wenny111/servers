#!/usr/bin/env node

// @CORE: 入口：根据命令行参数选择传输层，动态导入对应模块
const args = process.argv.slice(2);
const scriptName = args[0] || "stdio";

async function run() {
  try {
    // @LEARN: 动态 import 避免未使用的模块初始化，按需加载
    switch (scriptName) {
      case "stdio":
        // Import and run the default server
        await import("./transports/stdio.js");
        break;
      case "sse":
        // Import and run the SSE server
        await import("./transports/sse.js");
        break;
      case "streamableHttp":
        // Import and run the streamable HTTP server
        await import("./transports/streamableHttp.js");
        break;
      default:
        console.error(`-`.repeat(53));
        console.error(`  Everything Server Launcher`);
        console.error(`  Usage: node ./index.js [stdio|sse|streamableHttp]`);
        console.error(`  Default transport: stdio`);
        console.error(`-`.repeat(53));
        console.error(`Unknown transport: ${scriptName}`);
        console.log("Available transports:");
        console.log("- stdio");
        console.log("- sse");
        console.log("- streamableHttp");
        process.exit(1);
    }
  } catch (error) {
    console.error("Error running script:", error);
    process.exit(1);
  }
}

await run();
