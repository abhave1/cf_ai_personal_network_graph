/**
 * Tool definitions for the AI chat agent
 * Tools can either require human confirmation or execute automatically
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod/v3";

import type { Chat } from "./server";
import { getCurrentAgent } from "agents";
import { scheduleSchema } from "agents/schedule";
import { KnowledgeGraphManager } from "./knowledge_graph";

/**
 * Weather information tool that requires human confirmation
 * When invoked, this will present a confirmation dialog to the user
 */
const getWeatherInformation = tool({
  description: "show the weather in a given city to the user",
  inputSchema: z.object({ city: z.string() })
  // Omitting execute function makes this tool require human confirmation
});

/**
 * Local time tool that executes automatically
 * Since it includes an execute function, it will run without user confirmation
 * This is suitable for low-risk operations that don't need oversight
 */
const getLocalTime = tool({
  description: "get the local time for a specified location",
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => {
    console.log(`Getting local time for ${location}`);
    return "10am";
  }
});

const scheduleTask = tool({
  description: "A tool to schedule a task to be executed at a later time",
  inputSchema: scheduleSchema,
  execute: async ({ when, description }) => {
    // we can now read the agent context from the ALS store
    const { agent } = getCurrentAgent<Chat>();

    function throwError(msg: string): string {
      throw new Error(msg);
    }
    if (when.type === "no-schedule") {
      return "Not a valid schedule input";
    }
    const input =
      when.type === "scheduled"
        ? when.date // scheduled
        : when.type === "delayed"
          ? when.delayInSeconds // delayed
          : when.type === "cron"
            ? when.cron // cron
            : throwError("not a valid schedule input");
    try {
      agent!.schedule(input!, "executeTask", description);
    } catch (error) {
      console.error("error scheduling task", error);
      return `Error scheduling task: ${error}`;
    }
    return `Task scheduled for type "${when.type}" : ${input}`;
  }
});

/**
 * Tool to list all scheduled tasks
 * This executes automatically without requiring human confirmation
 */
const getScheduledTasks = tool({
  description: "List all tasks that have been scheduled",
  inputSchema: z.object({}),
  execute: async () => {
    const { agent } = getCurrentAgent<Chat>();

    try {
      const tasks = agent!.getSchedules();
      if (!tasks || tasks.length === 0) {
        return "No scheduled tasks found.";
      }
      return tasks;
    } catch (error) {
      console.error("Error listing scheduled tasks", error);
      return `Error listing scheduled tasks: ${error}`;
    }
  }
});

/**
 * Tool to cancel a scheduled task by its ID
 * This executes automatically without requiring human confirmation
 */
const cancelScheduledTask = tool({
  description: "Cancel a scheduled task using its ID",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to cancel")
  }),
  execute: async ({ taskId }) => {
    const { agent } = getCurrentAgent<Chat>();
    try {
      await agent!.cancelSchedule(taskId);
      return `Task ${taskId} has been successfully canceled.`;
    } catch (error) {
      console.error("Error canceling scheduled task", error);
      return `Error canceling task ${taskId}: ${error}`;
    }
  }
});

/**
 * Knowledge Graph Tool - Add text to user's knowledge graph
 * Uses Workflows for durable execution with automatic retries
 */
const addToKnowledgeGraph = tool({
  description: "Add text to the user's knowledge graph. Use this when the user shares information about their interests, experiences, or preferences.",
  inputSchema: z.object({
    text: z.string().describe("The text content to analyze and add to the knowledge graph"),
    userId: z.string().optional().describe("User ID (defaults to 'default_user')")
  }),
  execute: async ({ text, userId = "default_user" }) => {
    try {
      // Get the agent's environment to access D1
      const { agent } = getCurrentAgent<Chat>();
      const db = agent?.env?.DB;

      if (!db) {
        console.warn("No D1 database available in environment, using in-memory graph only");
      }

      // Direct execution with D1 database
      const manager = new KnowledgeGraphManager(userId, db);
      const result = await manager.addToGraph(text);
      return result;
    } catch (error) {
      console.error("Error adding to knowledge graph:", error);
      return `Error adding to knowledge graph: ${error}`;
    }
  }
});

/**
 * Knowledge Graph Tool - Query the user's knowledge graph
 * Retrieve insights, connections, and recommendations
 */
const queryKnowledgeGraph = tool({
  description: "Query the user's knowledge graph to find related topics, connections, or user interests. Use this to understand the user better and make personalized recommendations.",
  inputSchema: z.object({
    queryType: z.enum([
      "get_related_topics",
      "get_top_topics",
      "get_topic_path",
      "get_user_interests",
      "get_graph_summary"
    ]).describe("Type of query to perform"),
    params: z.record(z.any()).optional().describe("Query parameters (e.g., {topic: 'horses', limit: 5})"),
    userId: z.string().optional().describe("User ID (defaults to 'default_user')")
  }),
  execute: async ({ queryType, params = {}, userId = "default_user" }) => {
    try {
      // Get the agent's environment to access D1
      const { agent } = getCurrentAgent<Chat>();
      const db = agent?.env?.DB;

      if (!db) {
        console.warn("No D1 database available in environment, using in-memory graph only");
      }

      const manager = new KnowledgeGraphManager(userId, db);
      const result = await manager.queryGraph(queryType, params);
      return JSON.stringify(result, null, 2);
    } catch (error) {
      console.error("Error querying knowledge graph:", error);
      return `Error querying knowledge graph: ${error}`;
    }
  }
});

/**
 * Export all available tools
 * These will be provided to the AI model to describe available capabilities
 */
export const tools = {
  getWeatherInformation,
  getLocalTime,
  scheduleTask,
  getScheduledTasks,
  cancelScheduledTask,
  addToKnowledgeGraph,
  queryKnowledgeGraph
} satisfies ToolSet;

/**
 * Implementation of confirmation-required tools
 * This object contains the actual logic for tools that need human approval
 * Each function here corresponds to a tool above that doesn't have an execute function
 */
export const executions = {
  getWeatherInformation: async ({ city }: { city: string }) => {
    console.log(`Getting weather information for ${city}`);
    return `The weather in ${city} is sunny`;
  }
};
