/**
 * D1 Storage Layer for Knowledge Graph
 * Handles persistence of nodes, edges, and metadata
 */
import type { ExtractedKnowledge } from "./knowledge_graph";

export interface NodeData {
  id: string;
  userId: string;
  nodeType: "main_topic" | "subtopic" | "entity";
  label: string;
  weight: number;
  sentiment: "positive" | "neutral" | "negative";
  firstSeen: string;
  lastSeen: string;
}

export interface EdgeData {
  id?: number;
  userId: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  weight: number;
  lastUpdated: string;
}

export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  nodesByType: Record<string, number>;
  topTopics: Array<{ topic: string; weight: number; connections: number }>;
}

/**
 * Knowledge Graph Storage Manager using D1
 */
export class KnowledgeGraphStorage {
  constructor(private db: D1Database, private userId: string) {}

  /**
   * Create or update a node in the database
   */
  async upsertNode(
    nodeId: string,
    type: NodeData["nodeType"],
    sentiment: NodeData["sentiment"],
    contextType: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // Try to get existing node
    const existing = await this.db
      .prepare("SELECT id, weight FROM nodes WHERE id = ? AND user_id = ?")
      .bind(nodeId, this.userId)
      .first<{ id: string; weight: number }>();

    if (existing) {
      // Update existing node
      await this.db
        .prepare(
          `UPDATE nodes
           SET weight = weight + 1,
               last_seen = ?,
               sentiment = ?,
               updated_at = ?
           WHERE id = ? AND user_id = ?`
        )
        .bind(now, sentiment, now, nodeId, this.userId)
        .run();
    } else {
      // Insert new node
      await this.db
        .prepare(
          `INSERT INTO nodes (id, user_id, node_type, label, weight, sentiment, first_seen, last_seen)
           VALUES (?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .bind(nodeId, this.userId, type, nodeId, sentiment, now, now)
        .run();
    }

    // Add context type
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO node_contexts (node_id, user_id, context_type)
         VALUES (?, ?, ?)`
      )
      .bind(nodeId, this.userId, contextType)
      .run();
  }

  /**
   * Create or update an edge in the database
   */
  async upsertEdge(
    sourceId: string,
    targetId: string,
    relationType: string
  ): Promise<void> {
    const now = new Date().toISOString();

    // Try to get existing edge
    const existing = await this.db
      .prepare(
        `SELECT id, weight FROM edges
         WHERE user_id = ? AND source_id = ? AND target_id = ? AND relation_type = ?`
      )
      .bind(this.userId, sourceId, targetId, relationType)
      .first<{ id: number; weight: number }>();

    if (existing) {
      // Update existing edge
      await this.db
        .prepare(
          `UPDATE edges
           SET weight = weight + 1,
               last_updated = ?
           WHERE id = ?`
        )
        .bind(now, existing.id)
        .run();
    } else {
      // Insert new edge
      await this.db
        .prepare(
          `INSERT INTO edges (user_id, source_id, target_id, relation_type, weight, last_updated)
           VALUES (?, ?, ?, ?, 1, ?)`
        )
        .bind(this.userId, sourceId, targetId, relationType, now)
        .run();
    }
  }

  /**
   * Save text source and extraction results
   */
  async saveTextSource(
    textId: string,
    textContent: string,
    extracted: ExtractedKnowledge,
    workflowInstanceId?: string,
    extractionTimeMs?: number
  ): Promise<void> {
    const now = new Date().toISOString();

    // Save text source
    await this.db
      .prepare(
        `INSERT INTO text_sources (id, user_id, text_content, text_length, workflow_instance_id, processed_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(textId, this.userId, textContent, textContent.length, workflowInstanceId || null, now)
      .run();

    // Save extraction results
    await this.db
      .prepare(
        `INSERT INTO extraction_results
         (text_source_id, user_id, main_topics_count, subtopics_count, entities_count, relations_count, sentiment, context_type, extraction_time_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        textId,
        this.userId,
        extracted.mainTopics.length,
        extracted.subtopics.length,
        extracted.entities.length,
        extracted.relations.length,
        extracted.sentiment,
        extracted.contextType,
        extractionTimeMs || null
      )
      .run();
  }

  /**
   * Get related topics for a given topic
   */
  async getRelatedTopics(topicId: string, limit: number = 10): Promise<any[]> {
    const results = await this.db
      .prepare(
        `SELECT
          n.id as topic,
          n.node_type as type,
          n.weight,
          e.weight as connection_strength,
          e.relation_type
         FROM edges e
         JOIN nodes n ON (e.target_id = n.id OR e.source_id = n.id)
         WHERE e.user_id = ?
           AND (e.source_id = ? OR e.target_id = ?)
           AND n.id != ?
         ORDER BY e.weight DESC, n.weight DESC
         LIMIT ?`
      )
      .bind(this.userId, topicId, topicId, topicId, limit)
      .all();

    return results.results || [];
  }

  /**
   * Get top topics by weight
   */
  async getTopTopics(limit: number = 10): Promise<any[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM node_stats
         WHERE user_id = ?
         ORDER BY weight DESC, connection_count DESC
         LIMIT ?`
      )
      .bind(this.userId, limit)
      .all();

    return results.results || [];
  }

  /**
   * Find shortest path between two topics using BFS
   */
  async findPath(fromTopic: string, toTopic: string): Promise<string[] | null> {
    // Get all edges for the user
    const edges = await this.db
      .prepare(
        `SELECT source_id, target_id FROM edges WHERE user_id = ?`
      )
      .bind(this.userId)
      .all();

    if (!edges.results || edges.results.length === 0) {
      return null;
    }

    // Build adjacency list
    const graph = new Map<string, string[]>();
    for (const edge of edges.results as any[]) {
      if (!graph.has(edge.source_id)) {
        graph.set(edge.source_id, []);
      }
      if (!graph.has(edge.target_id)) {
        graph.set(edge.target_id, []);
      }
      graph.get(edge.source_id)!.push(edge.target_id);
      graph.get(edge.target_id)!.push(edge.source_id);
    }

    // BFS to find shortest path
    const queue: Array<{ node: string; path: string[] }> = [
      { node: fromTopic, path: [fromTopic] }
    ];
    const visited = new Set<string>([fromTopic]);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;

      if (node === toTopic) {
        return path;
      }

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push({ node: neighbor, path: [...path, neighbor] });
        }
      }
    }

    return null;
  }

  /**
   * Get user interests (positive sentiment or interest-related contexts)
   */
  async getUserInterests(limit: number = 20): Promise<any[]> {
    const results = await this.db
      .prepare(
        `SELECT * FROM user_interests
         WHERE user_id = ?
         ORDER BY mention_count DESC, connection_count DESC
         LIMIT ?`
      )
      .bind(this.userId, limit)
      .all();

    return results.results || [];
  }

  /**
   * Get graph statistics
   */
  async getGraphStats(): Promise<GraphStats> {
    // Total nodes
    const nodesCount = await this.db
      .prepare("SELECT COUNT(*) as count FROM nodes WHERE user_id = ?")
      .bind(this.userId)
      .first<{ count: number }>();

    // Total edges
    const edgesCount = await this.db
      .prepare("SELECT COUNT(*) as count FROM edges WHERE user_id = ?")
      .bind(this.userId)
      .first<{ count: number }>();

    // Nodes by type
    const nodesByType = await this.db
      .prepare(
        `SELECT node_type, COUNT(*) as count
         FROM nodes
         WHERE user_id = ?
         GROUP BY node_type`
      )
      .bind(this.userId)
      .all();

    // Top topics
    const topTopics = await this.getTopTopics(5);

    const nodesByTypeMap: Record<string, number> = {};
    if (nodesByType.results) {
      for (const row of nodesByType.results as any[]) {
        nodesByTypeMap[row.node_type] = row.count;
      }
    }

    return {
      totalNodes: nodesCount?.count || 0,
      totalEdges: edgesCount?.count || 0,
      nodesByType: nodesByTypeMap,
      topTopics: topTopics.map((t: any) => ({
        topic: t.label,
        weight: t.weight,
        connections: t.connection_count
      }))
    };
  }

  /**
   * Export full graph data
   */
  async exportGraph(): Promise<{ nodes: any[]; edges: any[] }> {
    const nodes = await this.db
      .prepare(
        `SELECT n.*, GROUP_CONCAT(nc.context_type) as context_types
         FROM nodes n
         LEFT JOIN node_contexts nc ON n.id = nc.node_id
         WHERE n.user_id = ?
         GROUP BY n.id`
      )
      .bind(this.userId)
      .all();

    const edges = await this.db
      .prepare("SELECT * FROM edges WHERE user_id = ?")
      .bind(this.userId)
      .all();

    return {
      nodes: nodes.results || [],
      edges: edges.results || []
    };
  }

  /**
   * Clear all data for user (useful for testing)
   */
  async clearUserData(): Promise<void> {
    await this.db.batch([
      this.db.prepare("DELETE FROM node_contexts WHERE user_id = ?").bind(this.userId),
      this.db.prepare("DELETE FROM edges WHERE user_id = ?").bind(this.userId),
      this.db.prepare("DELETE FROM nodes WHERE user_id = ?").bind(this.userId),
      this.db.prepare("DELETE FROM extraction_results WHERE user_id = ?").bind(this.userId),
      this.db.prepare("DELETE FROM text_sources WHERE user_id = ?").bind(this.userId)
    ]);
  }
}
