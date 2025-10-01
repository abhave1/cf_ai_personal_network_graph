# Personal Knowledge Graph AI Agent

An AI-powered chat application that builds and maintains a personal knowledge graph based on user conversations, automatically learning and remembering interests, experiences, and preferences.

## Assignment Requirements Fulfillment

This project fulfills all requirements for the AI-powered application assignment on Cloudflare:

### ✅ LLM Integration
- **Model**: Google Gemini 2.0 Flash Lite (`gemini-2.0-flash-lite`)
- **Implementation**: Uses Vercel AI SDK (`@ai-sdk/google`) for structured knowledge extraction and chat responses
- **Purpose**:
  - Extracts structured knowledge from user conversations (topics, entities, relations, sentiment, context)
  - Provides intelligent chat responses with streaming support
  - Automatically infers user interests without explicit instructions

### ✅ Workflow / Coordination
- **Cloudflare Workflows**: Configured for durable knowledge graph processing
  - `KnowledgeGraphWorkflow`: Handles text processing and graph building with automatic retries
  - `QueryGraphWorkflow`: Manages graph queries and analysis
- **Durable Objects**: `Chat` agent persists conversation state and provides coordination
- **Workers**: Main server handles routing, API endpoints, and real-time streaming

### ✅ User Input via Chat
- **Interactive Chat UI**: Built with React, featuring:
  - Real-time message streaming
  - Dark/Light theme support
  - Tool invocation cards with human-in-the-loop confirmation
  - Responsive design optimized for conversation flow
- **Knowledge Graph Tester**: Sidebar interface for direct graph queries
- **Cloudflare Pages**: Frontend served through Workers with assets binding

### ✅ Memory / State Management
- **D1 Database**: Persistent knowledge graph storage with:
  - **Nodes table**: Stores topics, entities, and subtopics with weights and sentiment
  - **Edges table**: Captures relationships and connections between concepts
  - **node_contexts table**: Tracks context types (interested_in, experienced_in, curious_about, etc.)
  - **text_sources table**: Maintains original text inputs with metadata
  - **extraction_results table**: Logs all knowledge extraction operations
- **SQL Views**:
  - `user_interests`: Aggregates user interests by sentiment and context
  - `node_stats`: Provides graph statistics and connection counts
- **In-Memory Graph**: Graphology-based graph structure for fast queries (with D1 fallback)
- **Durable Object Storage**: Chat agent state persists across requests
- **User-scoped data**: All knowledge graphs are per-user isolated

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      User Interface                          │
│  ┌──────────────────────┐  ┌──────────────────────────────┐│
│  │   Chat Interface     │  │  Knowledge Graph Tester       ││
│  │  - Message streaming │  │  - Query interface            ││
│  │  - Tool confirmations│  │  - Direct D1 queries          ││
│  └──────────────────────┘  └──────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Cloudflare Workers                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Chat Agent (Durable Object)                         │  │
│  │  - Message processing                                 │  │
│  │  - Tool execution                                     │  │
│  │  - State management                                   │  │
│  └──────────────────────────────────────────────────────┘  │
│                              │                               │
│         ┌────────────────────┼────────────────────┐         │
│         ▼                    ▼                    ▼         │
│  ┌──────────┐      ┌─────────────────┐   ┌──────────────┐ │
│  │ Gemini   │      │   Workflows      │   │  D1 Database │ │
│  │ 2.0 Flash│      │  - Graph build   │   │  - Nodes     │ │
│  │ Lite     │      │  - Query process │   │  - Edges     │ │
│  └──────────┘      └─────────────────┘   │  - Contexts  │ │
│                                            │  - Metadata  │ │
│                                            └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Features

### 🧠 Automatic Knowledge Extraction
- Analyzes conversations in real-time to extract:
  - Main topics and subtopics
  - Entities (people, places, things)
  - Relationships and connections
  - User sentiment (positive/neutral/negative)
  - Context type (interested_in, experienced_in, curious_about, wants_to_learn, etc.)

### 📊 Knowledge Graph
- Weighted nodes based on mention frequency
- Relationship tracking between topics
- Sentiment analysis per topic
- Context-aware interest classification
- Path finding between related topics
- Connection strength analysis

### 🔍 Query Capabilities
- **Get User Interests**: Retrieve topics the user cares about
- **Get Top Topics**: Most frequently mentioned subjects
- **Get Related Topics**: Find connections to a specific topic
- **Get Topic Path**: Shortest path between two topics
- **Get Graph Summary**: Overall statistics and insights

### 🛠️ Tool System
- **addToKnowledgeGraph**: Automatically called when user shares information
- **queryKnowledgeGraph**: Used for personalized recommendations and insights
- **scheduleTask**: Task scheduling with cron support
- Human-in-the-loop confirmations for sensitive operations

## Quick Start

### Prerequisites
- Node.js (v18+)
- Cloudflare account
- Google Generative AI API key

### Installation

1. **Navigate to the project directory:**
```bash
cd agents-starter
```

2. **Install dependencies:**
```bash
npm install
```

3. **Set up environment variables:**

Create a `.dev.vars` file in the root:
```env
GOOGLE_GENERATIVE_AI_API_KEY=your_api_key_here
```

4. **Initialize the D1 database:**

The database is already created with ID `36a57bcd-2b99-4ab1-aa79-3d245c6298be`. Apply the schema:
```bash
npx wrangler d1 execute knowledge-graph-db --local --file=./schema.sql
```

For remote deployment:
```bash
npx wrangler d1 execute knowledge-graph-db --remote --file=./schema.sql
```

5. **Generate TypeScript types:**
```bash
npm run types
```

6. **Start the development server:**
```bash
npm start
```

The application will be available at `http://localhost:5174/` (or next available port).

### Deployment

Deploy to Cloudflare Workers:
```bash
npm run deploy
```

## Usage

### Building Your Knowledge Graph

Simply chat with the AI naturally. The system automatically extracts and stores knowledge:

**Examples:**
- "I've been learning about machine learning lately"
  - Extracts: `main_topic: machine learning`, `context: wants_to_learn`, `sentiment: positive`

- "I went to a rodeo last weekend and loved it"
  - Extracts: `main_topic: rodeo`, `context: experienced_in`, `sentiment: positive`

- "Tell me more about horses"
  - Extracts: `main_topic: horses`, `context: curious_about`

### Querying Your Knowledge Graph

Use the **Knowledge Graph Tester** sidebar to query your personal graph:

1. Select query type from dropdown
2. Enter parameters (if needed)
3. Click "Run Query"
4. View results in JSON format

**Or** ask the AI to query it for you:
- "What are my top interests?"
- "Show me topics related to horses"
- "How are rodeo and horses connected in my interests?"

## Project Structure

```
agents-starter/
├── src/
│   ├── app.tsx                          # Main React UI
│   ├── server.ts                        # Worker entry point & Chat agent
│   ├── tools.ts                         # Tool definitions (knowledge graph, scheduling)
│   ├── knowledge_graph.ts               # Graph manager & extraction logic
│   ├── knowledge_graph_storage.ts       # D1 database operations
│   ├── knowledge_graph_workflow.ts      # Workflow definitions
│   ├── utils.ts                         # Helper utilities
│   └── components/
│       ├── knowledge-graph-tester/      # Graph query UI
│       ├── button/                      # UI components
│       ├── card/
│       ├── input/
│       └── ...
├── schema.sql                           # D1 database schema
├── wrangler.jsonc                       # Cloudflare configuration
└── package.json
```

## Key Files

### `server.ts`
- Chat agent implementation (Durable Object)
- System prompt with knowledge graph instructions
- API endpoints for graph queries
- Model configuration (Gemini 2.0 Flash Lite)

### `knowledge_graph.ts`
- Knowledge extraction using LLM
- Graph management with Graphology
- D1 storage integration
- Query methods (interests, topics, paths, stats)

### `knowledge_graph_storage.ts`
- D1 database operations
- Node/Edge CRUD operations
- SQL query helpers
- Path finding (BFS algorithm)

### `schema.sql`
- Database tables for nodes, edges, contexts
- Indexes for performance
- Views for aggregated queries (`user_interests`, `node_stats`)

### `tools.ts`
- `addToKnowledgeGraph`: Automatic knowledge extraction
- `queryKnowledgeGraph`: Graph query interface
- `scheduleTask`, `getScheduledTasks`, `cancelScheduledTask`: Task management

## Technical Highlights

### AI-Powered Knowledge Extraction
```typescript
// Automatically extracts structured data from conversational text
const knowledge = await extractKnowledge("I love horseback riding");
// Returns:
// {
//   mainTopics: ["horseback riding"],
//   subtopics: ["horses", "riding", "equestrian"],
//   entities: [],
//   relations: [...],
//   sentiment: "positive",
//   contextType: "interested_in"
// }
```

### Persistent Graph Storage
- Nodes weighted by mention frequency
- Edges track relationship strength
- Context types capture user's relationship with topics
- Timestamps for temporal analysis

### Proactive Learning
The AI agent automatically:
- Detects topics of interest from conversation
- Infers context without explicit statements
- Builds connections between related topics
- Updates weights based on engagement

## Database Schema

### Tables
- **nodes**: Topics, entities, subtopics with weights and sentiment
- **edges**: Relationships between nodes with connection strength
- **node_contexts**: Context types per node (interested_in, curious_about, etc.)
- **text_sources**: Original user inputs with metadata
- **extraction_results**: Knowledge extraction audit log

### Views
- **user_interests**: Aggregated user interests with sentiment filtering
- **node_stats**: Node statistics with connection counts

## Assignment Compliance Summary

| Requirement | Implementation | Status |
|-------------|----------------|--------|
| **LLM** | Google Gemini 2.0 Flash Lite via Vercel AI SDK | ✅ Complete |
| **Workflow/Coordination** | Cloudflare Workflows + Durable Objects + Workers | ✅ Complete |
| **User Input** | Interactive chat UI with streaming, served via Pages | ✅ Complete |
| **Memory/State** | D1 Database + Durable Object storage + In-memory graph | ✅ Complete |

## Additional Features Beyond Requirements

- 🎨 Dark/Light theme with system preference detection
- 📊 Knowledge graph visualization UI (tester interface)
- 🔄 Real-time streaming responses
- 🛡️ Human-in-the-loop tool confirmations
- 📅 Advanced task scheduling (cron support)
- 🔍 Multiple query types (interests, topics, paths, stats)
- 📈 Weighted graph with sentiment analysis
- 🔗 Relationship tracking and path finding
- 💾 Multi-layer persistence (D1 + Durable Objects + in-memory)

## License

MIT
