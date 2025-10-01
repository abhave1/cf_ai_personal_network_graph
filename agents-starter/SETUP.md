# Knowledge Graph Setup Guide

This guide will help you set up the D1 database and deploy your knowledge graph workflow.

## Prerequisites

- Cloudflare account with Workers access
- Wrangler CLI installed (`npm install -g wrangler`)
- `.dev.vars` file with `GROQ_API_KEY` set

## Setup Steps

### 1. Create D1 Database

First, create the D1 database:

```bash
wrangler d1 create knowledge-graph-db
```

This will output something like:

```
✅ Successfully created DB 'knowledge-graph-db'

[[d1_databases]]
binding = "DB"
database_name = "knowledge-graph-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### 2. Update wrangler.jsonc

Copy the `database_id` from the output above and update `wrangler.jsonc`:

```json
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "knowledge-graph-db",
    "database_id": "YOUR_DATABASE_ID_HERE"  // Replace with actual ID
  }
]
```

### 3. Initialize Database Schema

Run the schema initialization for local development:

```bash
wrangler d1 execute knowledge-graph-db --local --file=./schema.sql
```

For production (after first deploy):

```bash
wrangler d1 execute knowledge-graph-db --remote --file=./schema.sql
```

### 4. Set up Environment Variables

Create a `.dev.vars` file in the project root (if you haven't already):

```bash
GROQ_API_KEY=your_groq_api_key_here
```

### 5. Test Locally

Start the local development server:

```bash
npm run start
# or
wrangler dev
```

The application should now be running at `http://localhost:8787`

### 6. Deploy to Production

Deploy your application:

```bash
npm run deploy
# or
wrangler deploy
```

After deployment, set the production secret:

```bash
wrangler secret put GROQ_API_KEY
# Enter your Groq API key when prompted
```

## Usage

### Adding Text to Knowledge Graph

When you interact with the AI, it will automatically detect when you share information and add it to your knowledge graph:

```
User: "I'm really interested in rodeos and horse riding. I've been competing in barrel racing for 5 years."

AI: [Automatically calls addToKnowledgeGraph tool]
     "I've added that to your knowledge graph! You're interested in rodeos and horse riding,
     with experience in barrel racing."
```

### Querying Your Knowledge Graph

You can ask the AI to query your knowledge graph:

```
User: "What topics am I most interested in?"

AI: [Calls queryKnowledgeGraph with type "get_user_interests"]
     "Based on your knowledge graph, you're most interested in:
     1. Rodeos (mentioned 5 times, 12 connections)
     2. Horses (mentioned 4 times, 8 connections)
     3. Barrel racing (mentioned 3 times, 6 connections)"
```

### Available Query Types

- `get_related_topics` - Find topics connected to a specific topic
- `get_top_topics` - Most frequently mentioned topics
- `get_topic_path` - Find connection path between two topics
- `get_user_interests` - Topics with positive sentiment
- `get_graph_summary` - Overview of entire graph

## Monitoring Workflows

### View Workflow Instances

List all workflow instances:

```bash
wrangler workflows instances list KNOWLEDGE_GRAPH_WORKFLOW
```

### Check Workflow Status

Get details about a specific instance:

```bash
wrangler workflows instances describe KNOWLEDGE_GRAPH_WORKFLOW <instance-id>
```

### View in Dashboard

Visit your Cloudflare dashboard:
1. Go to Workers & Pages
2. Click on your worker
3. Navigate to "Workflows" tab
4. View all running/completed workflows

## Database Management

### View D1 Data

Query your D1 database:

```bash
# Get top topics
wrangler d1 execute knowledge-graph-db --local --command "SELECT * FROM node_stats ORDER BY weight DESC LIMIT 10"

# Get recent text sources
wrangler d1 execute knowledge-graph-db --local --command "SELECT id, user_id, text_length, processed_at FROM text_sources ORDER BY processed_at DESC LIMIT 10"

# Get graph statistics
wrangler d1 execute knowledge-graph-db --local --command "SELECT * FROM user_interests LIMIT 20"
```

### Backup D1 Database

```bash
wrangler d1 export knowledge-graph-db --output=backup.sql
```

### Clear User Data (for testing)

```bash
wrangler d1 execute knowledge-graph-db --local --command "DELETE FROM nodes WHERE user_id = 'default_user'"
```

## Troubleshooting

### "Database not found" error

Make sure you've:
1. Created the D1 database
2. Updated `wrangler.jsonc` with correct `database_id`
3. Run the schema initialization

### "GROQ_API_KEY not set" error

Make sure you've:
1. Created `.dev.vars` file with `GROQ_API_KEY`
2. For production, run `wrangler secret put GROQ_API_KEY`

### Workflow not triggering

Check:
1. Workflows are properly configured in `wrangler.jsonc`
2. Classes are exported from `server.ts`
3. Check logs with `wrangler tail`

### D1 Query Errors

If you get SQL errors:
1. Check that schema was properly initialized
2. Verify table names match schema
3. Check indexes are created

## Advanced Configuration

### Custom User IDs

By default, the system uses `"default_user"`. To use custom user IDs:

```typescript
// In your tool call
addToKnowledgeGraph({
  text: "Your text here",
  userId: "user_123"
})
```

### Adjusting Retry Strategies

Edit retry configuration in `knowledge_graph_workflow.ts`:

```typescript
{
  retries: {
    limit: 5,              // Number of retries
    delay: "5 seconds",    // Initial delay
    backoff: "exponential" // or "constant"
  },
  timeout: "2 minutes"     // Max time per step
}
```

### Storage Optimization

For production, consider:
- Adding indexes for frequently queried fields
- Implementing data archival for old text sources
- Setting up periodic cleanup jobs

## Next Steps

1. Customize the extraction prompt in `knowledge_graph.ts` for your use case
2. Add more query types in `knowledge_graph_storage.ts`
3. Build a visualization dashboard for the knowledge graph
4. Integrate with other Cloudflare services (R2, KV, Vectorize)
