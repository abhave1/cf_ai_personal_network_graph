import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Select } from "@/components/select/Select";
import { Input } from "@/components/input/Input";

type QueryType =
  | "get_user_interests"
  | "get_top_topics"
  | "get_related_topics"
  | "get_topic_path"
  | "get_graph_summary";

export function KnowledgeGraphTester() {
  const [queryType, setQueryType] = useState<QueryType>("get_user_interests");
  const [topic, setTopic] = useState("");
  const [fromTopic, setFromTopic] = useState("");
  const [toTopic, setToTopic] = useState("");
  const [limit, setLimit] = useState("10");
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleQuery = async () => {
    setLoading(true);
    setResult("");

    try {
      const params: Record<string, any> = {};

      // Add params based on query type
      if (queryType === "get_related_topics") {
        params.topic = topic;
        params.limit = parseInt(limit) || 10;
      } else if (queryType === "get_topic_path") {
        params.from = fromTopic;
        params.to = toTopic;
      } else if (queryType === "get_top_topics") {
        params.limit = parseInt(limit) || 10;
      } else if (queryType === "get_user_interests") {
        params.limit = parseInt(limit) || 20;
      }

      const response = await fetch("/api/query-knowledge-graph", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          queryType,
          params,
          userId: "default_user"
        })
      });

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (error) {
      setResult(`Error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-4 bg-neutral-50 dark:bg-neutral-900 border">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Knowledge Graph Tester</h3>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium mb-1 block">Query Type</label>
          <select
            value={queryType}
            onChange={(e) => setQueryType(e.target.value as QueryType)}
            className="w-full"
          >
            <option value="get_user_interests">Get User Interests</option>
            <option value="get_top_topics">Get Top Topics</option>
            <option value="get_related_topics">Get Related Topics</option>
            <option value="get_topic_path">Get Topic Path</option>
            <option value="get_graph_summary">Get Graph Summary</option>
          </select>
        </div>

        {queryType === "get_related_topics" && (
          <>
            <div>
              <label className="text-xs font-medium mb-1 block">Topic</label>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., horses"
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Limit</label>
              <input
                type="number"
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
                placeholder="10"
                className="w-full"
              />
            </div>
          </>
        )}

        {queryType === "get_topic_path" && (
          <>
            <div>
              <label className="text-xs font-medium mb-1 block">From Topic</label>
              <input
                value={fromTopic}
                onChange={(e) => setFromTopic(e.target.value)}
                placeholder="e.g., horses"
                className="w-full"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">To Topic</label>
              <input
                value={toTopic}
                onChange={(e) => setToTopic(e.target.value)}
                placeholder="e.g., rodeo"
                className="w-full"
              />
            </div>
          </>
        )}

        {(queryType === "get_top_topics" || queryType === "get_user_interests") && (
          <div>
            <label className="text-xs font-medium mb-1 block">Limit</label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="10"
              className="w-full"
            />
          </div>
        )}

        <Button onClick={handleQuery} disabled={loading} className="w-full">
          {loading ? "Querying..." : "Run Query"}
        </Button>

        {result && (
          <div>
            <label className="text-xs font-medium mb-1 block">Result</label>
            <pre className="text-xs bg-neutral-100 dark:bg-neutral-800 p-3 rounded overflow-auto max-h-64">
              {result}
            </pre>
          </div>
        )}
      </div>
    </Card>
  );
}
