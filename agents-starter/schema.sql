-- Knowledge Graph Database Schema for D1
-- This schema stores nodes, edges, and metadata for the user's knowledge graph

-- Nodes table: stores topics, subtopics, and entities
CREATE TABLE IF NOT EXISTS nodes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    node_type TEXT NOT NULL CHECK(node_type IN ('main_topic', 'subtopic', 'entity')),
    label TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    sentiment TEXT CHECK(sentiment IN ('positive', 'neutral', 'negative')),
    first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Context types table: stores user's relationship with topics
CREATE TABLE IF NOT EXISTS node_contexts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    context_type TEXT NOT NULL CHECK(context_type IN ('wants_to_learn', 'experienced_in', 'curious_about', 'interested_in', 'dislikes', 'neutral_mention')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(node_id, context_type)
);

-- Edges table: stores connections between nodes
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,
    weight INTEGER NOT NULL DEFAULT 1,
    last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES nodes(id) ON DELETE CASCADE,
    UNIQUE(user_id, source_id, target_id, relation_type)
);

-- Text sources table: tracks the original text that was processed
CREATE TABLE IF NOT EXISTS text_sources (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    text_content TEXT NOT NULL,
    text_length INTEGER NOT NULL,
    processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workflow_instance_id TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Extraction results table: stores what was extracted from each text
CREATE TABLE IF NOT EXISTS extraction_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text_source_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    main_topics_count INTEGER NOT NULL DEFAULT 0,
    subtopics_count INTEGER NOT NULL DEFAULT 0,
    entities_count INTEGER NOT NULL DEFAULT 0,
    relations_count INTEGER NOT NULL DEFAULT 0,
    sentiment TEXT,
    context_type TEXT,
    extraction_time_ms INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (text_source_id) REFERENCES text_sources(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_user_id ON nodes(user_id);
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_nodes_weight ON nodes(weight DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_user_weight ON nodes(user_id, weight DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_last_seen ON nodes(last_seen DESC);

CREATE INDEX IF NOT EXISTS idx_node_contexts_node_id ON node_contexts(node_id);
CREATE INDEX IF NOT EXISTS idx_node_contexts_user_id ON node_contexts(user_id);

CREATE INDEX IF NOT EXISTS idx_edges_user_id ON edges(user_id);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_weight ON edges(weight DESC);
CREATE INDEX IF NOT EXISTS idx_edges_user_source ON edges(user_id, source_id);
CREATE INDEX IF NOT EXISTS idx_edges_user_target ON edges(user_id, target_id);

CREATE INDEX IF NOT EXISTS idx_text_sources_user_id ON text_sources(user_id);
CREATE INDEX IF NOT EXISTS idx_text_sources_processed_at ON text_sources(processed_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_results_user_id ON extraction_results(user_id);
CREATE INDEX IF NOT EXISTS idx_extraction_results_text_source ON extraction_results(text_source_id);

-- View for getting node statistics
CREATE VIEW IF NOT EXISTS node_stats AS
SELECT
    n.user_id,
    n.id as node_id,
    n.label,
    n.node_type,
    n.weight,
    n.sentiment,
    COUNT(DISTINCT e1.id) + COUNT(DISTINCT e2.id) as connection_count,
    n.first_seen,
    n.last_seen
FROM nodes n
LEFT JOIN edges e1 ON n.id = e1.source_id
LEFT JOIN edges e2 ON n.id = e2.target_id
GROUP BY n.id;

-- View for getting user interest summary
CREATE VIEW IF NOT EXISTS user_interests AS
SELECT
    n.user_id,
    n.label as topic,
    n.node_type,
    n.weight as mention_count,
    n.sentiment,
    GROUP_CONCAT(DISTINCT nc.context_type) as context_types,
    COUNT(DISTINCT e1.id) + COUNT(DISTINCT e2.id) as connection_count,
    n.last_seen
FROM nodes n
LEFT JOIN node_contexts nc ON n.id = nc.node_id
LEFT JOIN edges e1 ON n.id = e1.source_id
LEFT JOIN edges e2 ON n.id = e2.target_id
WHERE n.sentiment = 'positive' OR nc.context_type IN ('interested_in', 'experienced_in', 'curious_about')
GROUP BY n.id
ORDER BY n.weight DESC, connection_count DESC;
