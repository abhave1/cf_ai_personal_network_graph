import { routeAgentRequest, type Schedule } from "agents";

import { getSchedulePrompt } from "agents/schedule";

import { AIChatAgent } from "agents/ai-chat-agent";

// Export workflows
export { KnowledgeGraphWorkflow, QueryGraphWorkflow } from "./knowledge_graph_workflow";
import {
  generateId,
  streamText,
  type StreamTextOnFinishCallback,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { google } from "@ai-sdk/google";
import { processToolCalls, cleanupMessages } from "./utils";
import { tools, executions } from "./tools";
// import { env } from "cloudflare:workers";

const model = google("gemini-2.0-flash-lite");
// Cloudflare AI Gateway
// const groq = createGroq({
//   apiKey: env.GROQ_API_KEY,
//   baseURL: env.GATEWAY_BASE_URL,
// });

/**
 * Chat Agent implementation that handles real-time AI chat interactions
 */
export class Chat extends AIChatAgent<Env> {
  /**
   * Handles incoming chat messages and manages the response stream
   */
  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    // const mcpConnection = await this.mcp.connect(
    //   "https://path-to-mcp-server/sse"
    // );

    // Collect all tools, including MCP tools
    const allTools = {
      ...tools,
      ...this.mcp.getAITools()
    };

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        // Clean up incomplete tool calls to prevent API errors
        const cleanedMessages = cleanupMessages(this.messages);

        // Process any pending tool calls from previous messages
        // This handles human-in-the-loop confirmations for tools
        const processedMessages = await processToolCalls({
          messages: cleanedMessages,
          dataStream: writer,
          tools: allTools,
          executions
        });

        const result = streamText({
          system: `You are a helpful AI assistant with a personal knowledge graph that learns about the user's interests, experiences, and preferences.

## Knowledge Graph Learning
- AUTOMATICALLY use the addToKnowledgeGraph tool whenever the user shares information about:
  * Topics they're interested in or curious about
  * Things they've experienced or done
  * Preferences, likes, or dislikes
  * Questions about specific topics (indicates curiosity)
  * Stories, anecdotes, or personal experiences
- You do NOT need explicit permission - extract and add knowledge proactively
- The more you learn, the better you can personalize responses and make recommendations

## Query Knowledge Graph
- Use queryKnowledgeGraph to:
  * Find related topics to what the user is discussing
  * Understand the user's broader interests
  * Make personalized recommendations based on their interest graph
  * Find connections between topics they care about

${getSchedulePrompt({ date: new Date() })}

If the user asks to schedule a task, use the schedule tool to schedule the task.
`,

          messages: convertToModelMessages(processedMessages),
          model,
          tools: allTools,
          // Type boundary: streamText expects specific tool types, but base class uses ToolSet
          // This is safe because our tools satisfy ToolSet interface (verified by 'satisfies' in tools.ts)
          onFinish: onFinish as unknown as StreamTextOnFinishCallback<
            typeof allTools
          >,
          stopWhen: stepCountIs(10)
        });

        writer.merge(result.toUIMessageStream());
      }
    });

    return createUIMessageStreamResponse({ stream });
  }
  async executeTask(description: string, _task: Schedule<string>) {
    await this.saveMessages([
      ...this.messages,
      {
        id: generateId(),
        role: "user",
        parts: [
          {
            type: "text",
            text: `Running scheduled task: ${description}`
          }
        ],
        metadata: {
          createdAt: new Date()
        }
      }
    ]);
  }
}

/**
 * Worker entry point that routes incoming requests to the appropriate handler
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    // Knowledge graph query endpoint for testing
    if (url.pathname === "/api/query-knowledge-graph" && request.method === "POST") {
      try {
        const { queryType, params, userId } = await request.json() as {
          queryType: string;
          params: Record<string, any>;
          userId: string;
        };

        const { KnowledgeGraphManager } = await import("./knowledge_graph");
        const manager = new KnowledgeGraphManager(userId || "default_user", env.DB);
        const result = await manager.queryGraph(queryType, params || {});

        return Response.json(result);
      } catch (error) {
        console.error("Error querying knowledge graph:", error);
        return Response.json({ error: String(error) }, { status: 500 });
      }
    }

    if (!process.env.GROQ_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      console.error(
        "No API key set, don't forget to set it locally in .dev.vars"
      );
    }
    return (
      // Route the request to our agent or return 404 if not found
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
