/**
 * Durable Workflow for Knowledge Graph Processing
 * Uses Cloudflare Workflows to make knowledge extraction resilient
 */
import {
  WorkflowEntrypoint,
  WorkflowEvent,
  WorkflowStep
} from "cloudflare:workers";
import { KnowledgeGraphManager, type ExtractedKnowledge } from "./knowledge_graph";
import { KnowledgeGraphStorage } from "./knowledge_graph_storage";

export type KnowledgeGraphWorkflowParams = {
  userId: string;
  text: string;
  textId?: string; // Optional ID to track the text source
};

/**
 * Workflow for processing text into knowledge graph
 * Each step is individually retriable and persists state
 */
export class KnowledgeGraphWorkflow extends WorkflowEntrypoint<
  Env,
  KnowledgeGraphWorkflowParams
> {
  async run(
    event: WorkflowEvent<KnowledgeGraphWorkflowParams>,
    step: WorkflowStep
  ) {
    const { userId, text, textId } = event.payload;
    const startTime = Date.now();

    // Step 1: Initialize storage and graph manager
    const storage = await step.do(
      "initialize-storage",
      {
        retries: {
          limit: 3,
          delay: "1 second",
          backoff: "exponential"
        },
        timeout: "30 seconds"
      },
      async () => {
        console.log(`Initializing D1 storage for user: ${userId}`);
        return new KnowledgeGraphStorage(this.env.DB, userId);
      }
    );

    const manager = await step.do(
      "initialize-graph-manager",
      {
        retries: {
          limit: 3,
          delay: "1 second",
          backoff: "exponential"
        },
        timeout: "30 seconds"
      },
      async () => {
        console.log(`Initializing knowledge graph for user: ${userId}`);
        return new KnowledgeGraphManager(userId, this.env.DB);
      }
    );

    // Step 2: Extract knowledge using Groq
    // This is the most likely to fail (API calls), so we add aggressive retries
    const extractedKnowledge = await step.do(
      "extract-knowledge-from-text",
      {
        retries: {
          limit: 5,
          delay: "5 seconds",
          backoff: "exponential"
        },
        timeout: "2 minutes"
      },
      async () => {
        console.log(`Extracting knowledge from text (${text.length} chars)`);
        return await manager.extractKnowledge(text);
      }
    );

    // Step 3: Validate extracted knowledge
    const validatedKnowledge = await step.do(
      "validate-extracted-knowledge",
      async () => {
        console.log(
          `Validating extracted knowledge: ${extractedKnowledge.mainTopics.length} topics, ${extractedKnowledge.entities.length} entities`
        );

        // Ensure we have at least some data
        if (
          extractedKnowledge.mainTopics.length === 0 &&
          extractedKnowledge.subtopics.length === 0 &&
          extractedKnowledge.entities.length === 0
        ) {
          throw new Error("No knowledge extracted from text");
        }

        return extractedKnowledge;
      }
    );

    // Step 4: Add main topics to D1
    const mainTopicResults = await step.do(
      "add-main-topics-to-db",
      {
        retries: {
          limit: 3,
          delay: "2 seconds",
          backoff: "constant"
        }
      },
      async () => {
        const results = [];
        for (const topic of validatedKnowledge.mainTopics) {
          console.log(`Adding main topic to D1: ${topic}`);
          await storage.upsertNode(
            topic.toLowerCase(),
            "main_topic",
            validatedKnowledge.sentiment,
            validatedKnowledge.contextType
          );
          results.push({
            topic: topic.toLowerCase(),
            type: "main_topic" as const
          });
        }
        return results;
      }
    );

    // Step 5: Add subtopics to D1
    const subtopicResults = await step.do(
      "add-subtopics-to-db",
      {
        retries: {
          limit: 3,
          delay: "2 seconds",
          backoff: "constant"
        }
      },
      async () => {
        const results = [];
        for (const subtopic of validatedKnowledge.subtopics) {
          console.log(`Adding subtopic to D1: ${subtopic}`);
          await storage.upsertNode(
            subtopic.toLowerCase(),
            "subtopic",
            validatedKnowledge.sentiment,
            validatedKnowledge.contextType
          );
          results.push({
            topic: subtopic.toLowerCase(),
            type: "subtopic" as const
          });
        }
        return results;
      }
    );

    // Step 6: Add entities to D1
    const entityResults = await step.do(
      "add-entities-to-db",
      {
        retries: {
          limit: 3,
          delay: "2 seconds",
          backoff: "constant"
        }
      },
      async () => {
        const results = [];
        for (const entity of validatedKnowledge.entities) {
          console.log(`Adding entity to D1: ${entity}`);
          await storage.upsertNode(
            entity.toLowerCase(),
            "entity",
            validatedKnowledge.sentiment,
            validatedKnowledge.contextType
          );
          results.push({
            entity: entity.toLowerCase(),
            type: "entity" as const
          });
        }
        return results;
      }
    );

    // Step 7: Create connections/relations in D1
    const relationResults = await step.do(
      "create-relations-in-db",
      {
        retries: {
          limit: 3,
          delay: "2 seconds",
          backoff: "constant"
        }
      },
      async () => {
        const results = [];
        for (const relation of validatedKnowledge.relations) {
          console.log(
            `Creating relation in D1: ${relation.from} -> ${relation.to} (${relation.type})`
          );
          await storage.upsertEdge(
            relation.from.toLowerCase(),
            relation.to.toLowerCase(),
            relation.type
          );
          results.push({
            from: relation.from.toLowerCase(),
            to: relation.to.toLowerCase(),
            type: relation.type
          });
        }

        // Also create topic-subtopic relations
        for (const mainTopic of validatedKnowledge.mainTopics) {
          for (const subtopic of validatedKnowledge.subtopics) {
            await storage.upsertEdge(
              mainTopic.toLowerCase(),
              subtopic.toLowerCase(),
              "subtopic_of"
            );
          }
        }

        return results;
      }
    );

    // Step 8: Save text source and extraction metadata
    const persistResult = await step.do(
      "save-text-source-metadata",
      {
        retries: {
          limit: 5,
          delay: "3 seconds",
          backoff: "exponential"
        },
        timeout: "1 minute"
      },
      async () => {
        console.log(`Saving text source metadata for user: ${userId}`);

        const extractionTimeMs = Date.now() - startTime;
        const actualTextId = textId || `text_${Date.now()}`;

        // Save text source and extraction results to D1
        await storage.saveTextSource(
          actualTextId,
          text,
          validatedKnowledge,
          event.id, // workflow instance ID
          extractionTimeMs
        );

        // Get graph statistics from D1
        const graphStats = await storage.getGraphStats();

        const stats = {
          userId,
          textId: actualTextId,
          timestamp: new Date().toISOString(),
          nodesAdded: {
            mainTopics: mainTopicResults.length,
            subtopics: subtopicResults.length,
            entities: entityResults.length
          },
          relationsAdded: relationResults.length,
          extractionTimeMs,
          graphStats
        };

        console.log("D1 persist stats:", JSON.stringify(stats, null, 2));

        return stats;
      }
    );

    // Step 9: Generate insights from D1
    const insights = await step.do(
      "generate-insights-from-db",
      {
        retries: {
          limit: 3,
          delay: "2 seconds",
          backoff: "constant"
        }
      },
      async () => {
        console.log(`Generating insights from D1 for user: ${userId}`);

        // Query D1 for insights
        const topTopics = await storage.getTopTopics(5);
        const userInterests = await storage.getUserInterests(10);

        return {
          topTopics,
          userInterests,
          sentiment: validatedKnowledge.sentiment,
          contextType: validatedKnowledge.contextType
        };
      }
    );

    // Return final summary
    return {
      success: true,
      userId,
      textId,
      extractedKnowledge: {
        mainTopics: validatedKnowledge.mainTopics.length,
        subtopics: validatedKnowledge.subtopics.length,
        entities: validatedKnowledge.entities.length,
        relations: validatedKnowledge.relations.length
      },
      persistResult,
      insights,
      processedAt: new Date().toISOString()
    };
  }
}

/**
 * Simpler workflow for querying the knowledge graph
 */
export type QueryGraphWorkflowParams = {
  userId: string;
  queryType: string;
  params?: Record<string, any>;
};

export class QueryGraphWorkflow extends WorkflowEntrypoint<
  Env,
  QueryGraphWorkflowParams
> {
  async run(
    event: WorkflowEvent<QueryGraphWorkflowParams>,
    step: WorkflowStep
  ) {
    const { userId, queryType, params = {} } = event.payload;

    // Step 1: Load graph
    const manager = await step.do(
      "load-graph-manager",
      {
        retries: {
          limit: 3,
          delay: "1 second",
          backoff: "exponential"
        }
      },
      async () => {
        console.log(`Loading knowledge graph for user: ${userId}`);
        return new KnowledgeGraphManager(userId);
      }
    );

    // Step 2: Execute query
    const results = await step.do(
      `query-${queryType}`,
      {
        retries: {
          limit: 3,
          delay: "1 second",
          backoff: "constant"
        }
      },
      async () => {
        console.log(`Executing query: ${queryType}`, params);
        return manager.queryGraph(queryType, params);
      }
    );

    return {
      success: true,
      userId,
      queryType,
      results,
      queriedAt: new Date().toISOString()
    };
  }
}
