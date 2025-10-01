/**
 * Knowledge Graph implementation using Graphology
 * Manages user-specific knowledge graphs with weighted connections
 */
import Graph from "graphology";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { KnowledgeGraphStorage } from "./knowledge_graph_storage";

// Schema for extracted knowledge
export const ExtractedKnowledge = z.object({
  mainTopics: z.array(z.string()).describe("Primary topics or themes in the text"),
  subtopics: z.array(z.string()).describe("Secondary topics or related concepts"),
  entities: z.array(z.string()).describe("Specific entities, people, places, or things mentioned"),
  relations: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.string().describe("Type of relationship: 'relates_to', 'subtopic_of', 'mentioned_with', etc.")
  })),
  sentiment: z.enum(["positive", "neutral", "negative"]).describe("Overall sentiment towards the topics"),
  contextType: z.enum(["wants_to_learn", "experienced_in", "curious_about", "interested_in", "dislikes", "neutral_mention"]).describe("User's relationship with the topic")
});

export type ExtractedKnowledge = z.infer<typeof ExtractedKnowledge>;

// Node attributes in the graph
interface NodeAttributes {
  type: "main_topic" | "subtopic" | "entity";
  label: string;
  weight: number; // How often this node appears
  sentiment: "positive" | "neutral" | "negative";
  contextType: string[];
  firstSeen: string;
  lastSeen: string;
}

// Edge attributes
interface EdgeAttributes {
  weight: number; // Strength of connection
  relationType: string;
  lastUpdated: string;
}

/**
 * Knowledge Graph Manager for a specific user
 */
export class KnowledgeGraphManager {
  private graph: Graph<NodeAttributes, EdgeAttributes>;
  private userId: string;
  private storageKey: string;
  private db?: D1Database;

  constructor(userId: string, db?: D1Database) {
    this.userId = userId;
    this.storageKey = `knowledge_graph_${userId}`;
    this.graph = new Graph({ multi: false, type: "undirected" });
    this.db = db;
    this.loadGraph();
  }

  /**
   * Extract structured knowledge from text using Groq
   */
  async extractKnowledge(text: string): Promise<ExtractedKnowledge> {
    try {
      console.log(`Extracting knowledge from text: "${text.substring(0, 100)}..."`);

      const { text: responseText } = await generateText({
        model: google("gemini-2.0-flash-lite"),
        messages: [
          {
            role: "system",
            content: `You are a knowledge extraction expert. Extract structured information from the user's text and return ONLY a valid JSON object with this exact structure:
{
  "mainTopics": ["array of main topics"],
  "subtopics": ["array of subtopics"],
  "entities": ["array of specific entities, people, places, things"],
  "relations": [{"from": "topic1", "to": "topic2", "type": "relation_type"}],
  "sentiment": "positive" | "neutral" | "negative",
  "contextType": "wants_to_learn" | "experienced_in" | "curious_about" | "interested_in" | "dislikes" | "neutral_mention"
}

Rules:
- Normalize topic names (e.g., "rodeo" and "rodeos" → "rodeo")
- Return ONLY the JSON object, no other text
- Ensure all fields are present, use empty arrays if needed`
          },
          {
            role: "user",
            content: `Extract knowledge from this text:\n\n${text}`
          }
        ]
      });

      console.log('Raw response:', responseText);

      // Parse the JSON response
      let parsed;
      try {
        // Remove markdown code blocks if present
        const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Failed to parse JSON:', parseError);
        console.error('Response text:', responseText);
        throw new Error(`Failed to parse extraction result: ${parseError}`);
      }

      // Validate with Zod
      const validated = ExtractedKnowledge.parse(parsed);
      console.log('Extraction result:', JSON.stringify(validated, null, 2));

      return validated;
    } catch (error) {
      console.error('Error in extractKnowledge:', error);
      throw error;
    }
  }

  /**
   * Add or update a node in the graph
   */
  private addOrUpdateNode(
    nodeId: string,
    type: NodeAttributes["type"],
    sentiment: NodeAttributes["sentiment"],
    contextType: string
  ) {
    const now = new Date().toISOString();

    if (this.graph.hasNode(nodeId)) {
      // Update existing node
      const attrs = this.graph.getNodeAttributes(nodeId);
      this.graph.setNodeAttribute(nodeId, "weight", attrs.weight + 1);
      this.graph.setNodeAttribute(nodeId, "lastSeen", now);
      this.graph.setNodeAttribute(nodeId, "sentiment", sentiment);

      // Add context type if not already present
      if (!attrs.contextType.includes(contextType)) {
        this.graph.setNodeAttribute(nodeId, "contextType", [...attrs.contextType, contextType]);
      }
    } else {
      // Create new node
      this.graph.addNode(nodeId, {
        type,
        label: nodeId,
        weight: 1,
        sentiment,
        contextType: [contextType],
        firstSeen: now,
        lastSeen: now
      });
    }
  }

  /**
   * Add or update an edge between two nodes
   */
  private addOrUpdateEdge(
    source: string,
    target: string,
    relationType: string
  ) {
    const now = new Date().toISOString();

    if (this.graph.hasEdge(source, target)) {
      // Update existing edge
      const attrs = this.graph.getEdgeAttributes(source, target);
      this.graph.setEdgeAttribute(source, target, "weight", attrs.weight + 1);
      this.graph.setEdgeAttribute(source, target, "lastUpdated", now);
    } else {
      // Create new edge
      this.graph.addEdge(source, target, {
        weight: 1,
        relationType,
        lastUpdated: now
      });
    }
  }

  /**
   * Add extracted knowledge to the graph
   */
  async addToGraph(text: string): Promise<string> {
    try {
      const knowledge = await this.extractKnowledge(text);

      // If we have D1, use storage layer
      if (this.db) {
        const storage = new KnowledgeGraphStorage(this.db, this.userId);

        // Save all nodes to D1
        for (const topic of knowledge.mainTopics) {
          await storage.upsertNode(
            topic.toLowerCase(),
            "main_topic",
            knowledge.sentiment,
            knowledge.contextType
          );
        }

        for (const subtopic of knowledge.subtopics) {
          await storage.upsertNode(
            subtopic.toLowerCase(),
            "subtopic",
            knowledge.sentiment,
            knowledge.contextType
          );
        }

        for (const entity of knowledge.entities) {
          await storage.upsertNode(
            entity.toLowerCase(),
            "entity",
            knowledge.sentiment,
            knowledge.contextType
          );
        }

        // Save all edges to D1
        for (const relation of knowledge.relations) {
          await storage.upsertEdge(
            relation.from.toLowerCase(),
            relation.to.toLowerCase(),
            relation.type
          );
        }

        // Create topic-subtopic relations
        for (const mainTopic of knowledge.mainTopics) {
          for (const subtopic of knowledge.subtopics) {
            await storage.upsertEdge(
              mainTopic.toLowerCase(),
              subtopic.toLowerCase(),
              "subtopic_of"
            );
          }
        }

        // Create entity co-occurrence relations
        for (let i = 0; i < knowledge.entities.length; i++) {
          for (let j = i + 1; j < knowledge.entities.length; j++) {
            await storage.upsertEdge(
              knowledge.entities[i].toLowerCase(),
              knowledge.entities[j].toLowerCase(),
              "mentioned_with"
            );
          }
        }

        // Save text source metadata
        const textId = `text_${Date.now()}`;
        await storage.saveTextSource(textId, text, knowledge);

        console.log(`✅ Saved to D1: ${knowledge.mainTopics.length} topics, ${knowledge.subtopics.length} subtopics, ${knowledge.entities.length} entities`);
      } else {
        // Fallback to in-memory graph
        console.warn("No D1 available, using in-memory graph only");

        for (const topic of knowledge.mainTopics) {
          this.addOrUpdateNode(
            topic.toLowerCase(),
            "main_topic",
            knowledge.sentiment,
            knowledge.contextType
          );
        }

        for (const subtopic of knowledge.subtopics) {
          this.addOrUpdateNode(
            subtopic.toLowerCase(),
            "subtopic",
            knowledge.sentiment,
            knowledge.contextType
          );
        }

        for (const entity of knowledge.entities) {
          this.addOrUpdateNode(
            entity.toLowerCase(),
            "entity",
            knowledge.sentiment,
            knowledge.contextType
          );
        }

        for (const relation of knowledge.relations) {
          const from = relation.from.toLowerCase();
          const to = relation.to.toLowerCase();
          if (this.graph.hasNode(from) && this.graph.hasNode(to)) {
            this.addOrUpdateEdge(from, to, relation.type);
          }
        }
      }

      return `Successfully added knowledge to graph. Extracted ${knowledge.mainTopics.length} main topics, ${knowledge.subtopics.length} subtopics, and ${knowledge.entities.length} entities.`;
    } catch (error) {
      console.error("Error adding to knowledge graph:", error);
      throw error;
    }
  }

  /**
   * Query the knowledge graph
   */
  async queryGraph(queryType: string, params: Record<string, any> = {}): Promise<any> {
    // If we have D1, query from storage
    if (this.db) {
      const storage = new KnowledgeGraphStorage(this.db, this.userId);

      switch (queryType) {
        case "get_related_topics": {
          const topic = params.topic?.toLowerCase();
          if (!topic) {
            return { error: "Topic parameter required" };
          }
          const related = await storage.getRelatedTopics(topic, params.limit || 10);
          return { topic, relatedTopics: related };
        }

        case "get_top_topics": {
          const topTopics = await storage.getTopTopics(params.limit || 10);
          return { topTopics };
        }

        case "get_topic_path": {
          const from = params.from?.toLowerCase();
          const to = params.to?.toLowerCase();
          if (!from || !to) {
            return { error: "Both 'from' and 'to' parameters required" };
          }
          const path = await storage.findPath(from, to);
          return path ? { path, connections: path.length - 1 } : { error: "No path found" };
        }

        case "get_user_interests": {
          const interests = await storage.getUserInterests(params.limit || 20);
          return { interests };
        }

        case "get_graph_summary": {
          const stats = await storage.getGraphStats();
          return stats;
        }

        default:
          return { error: `Unknown query type: ${queryType}` };
      }
    }

    // Fallback to in-memory graph
    console.warn("No D1 available, querying in-memory graph");
    switch (queryType) {
      case "get_related_topics": {
        const topic = params.topic?.toLowerCase();
        if (!topic || !this.graph.hasNode(topic)) {
          return { error: `Topic "${topic}" not found in knowledge graph` };
        }

        const neighbors = this.graph.neighbors(topic);
        const related = neighbors.map(neighbor => {
          const attrs = this.graph.getNodeAttributes(neighbor);
          const edge = this.graph.getEdgeAttributes(topic, neighbor);
          return {
            topic: neighbor,
            type: attrs.type,
            weight: attrs.weight,
            connectionStrength: edge.weight,
            relationType: edge.relationType
          };
        }).sort((a, b) => b.connectionStrength - a.connectionStrength);

        return { topic, relatedTopics: related };
      }

      case "get_top_topics": {
        const limit = params.limit || 10;
        const nodes = this.graph.nodes().map(node => ({
          topic: node,
          ...this.graph.getNodeAttributes(node)
        })).sort((a, b) => b.weight - a.weight).slice(0, limit);

        return { topTopics: nodes };
      }

      case "get_user_interests": {
        const interests = this.graph.nodes()
          .map(node => {
            const attrs = this.graph.getNodeAttributes(node);
            return {
              topic: node,
              type: attrs.type,
              weight: attrs.weight,
              sentiment: attrs.sentiment,
              contextTypes: attrs.contextType,
              connections: this.graph.degree(node)
            };
          })
          .filter(n => n.sentiment === "positive" || n.contextTypes.includes("interested_in"))
          .sort((a, b) => b.weight - a.weight);

        return { interests };
      }

      case "get_graph_summary": {
        return {
          totalNodes: this.graph.order,
          totalEdges: this.graph.size,
          topTopics: this.graph.nodes()
            .map(node => ({
              topic: node,
              weight: this.graph.getNodeAttribute(node, "weight"),
              connections: this.graph.degree(node)
            }))
            .sort((a, b) => b.weight - a.weight)
            .slice(0, 5)
        };
      }

      default:
        return { error: `Unknown query type: ${queryType}` };
    }
  }

  /**
   * Save graph to D1 database (if available)
   */
  private async saveGraph() {
    if (!this.db) {
      console.log(`No D1 database available for user ${this.userId}, skipping persistence`);
      return;
    }

    console.log(`Saving knowledge graph for user ${this.userId} to D1`);

    // Note: Actual saving is done through KnowledgeGraphStorage
    // This is kept for backward compatibility
  }

  /**
   * Load graph from D1 database (if available)
   */
  private async loadGraph() {
    if (!this.db) {
      console.log(`No D1 database available for user ${this.userId}, starting with empty graph`);
      return;
    }

    console.log(`Loading knowledge graph for user ${this.userId} from D1`);

    // Note: This is now handled by KnowledgeGraphStorage
    // This method is kept for backward compatibility
  }

  /**
   * Export graph as JSON
   */
  exportGraph() {
    return {
      nodes: this.graph.nodes().map(node => ({
        id: node,
        ...this.graph.getNodeAttributes(node)
      })),
      edges: this.graph.edges().map(edge => ({
        source: this.graph.source(edge),
        target: this.graph.target(edge),
        ...this.graph.getEdgeAttributes(edge)
      }))
    };
  }
}
