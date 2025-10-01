can you make the codebase so that it uses groq for the ai provider rather than openai?

ok perfect, now i want you to create a knowledge base tool that the ai can connect to a 
knowledge base, and this knowledg ebase is like a knolwedge graph (build it with networkx) 
and i want you to make it so that when the user gives you a set of text, you extract 3 key 
things main topic, title, date, and relation and basically given text we are going to build 
a user profile. but initially we are going to focus soley on text. just create a network 
graph or network database for just text that is pasted in by the user. and then as i keep 
pasting in context, keep doing the same extraction principles and create an entire knowledge
 graph. now for the knowledge graph information and criteria, i want you to order the 
knowledge grpah by topics, and also relavency and number of nodes that are connected. (eg. 
lets say the user pastes text that is somewhat related to Rodeos, and the user pastes 
another piece of text related to rodeos, then also add that to the node, and increase the 
weightage of that node). don't guess, ask questions if you need more information 

k, so for now lets store it in json. for entity extraction i think we can use the groq 
api and do summarization, extraction etc. the relation i want to capture is lets say node a 
contains the major topic (rodeo) i want to create connetions to subtpoics, relations, and 
also how close they are to each other. like a user profile. so if i get text with rodeo, and
 i also get text with horses, they would be somewhat related, but if there are connections, 
definitley connect them (eg. oh, i know that these things are very interrelated, let me 
connect them) and for the graph query, it should be throuhg a tool (the user has pated text,
 let me analyze and insert into the user knowledge representaiton) and then for the graph 
queries, i want to perofrm connection nodes, or paths that the AI can use or traverse to 
give more insight into the user (for example, some suggestions for events would be to read 
this book, because i saw that previously and throughout your kowledge graph you ahve been 
interested in horses, and murder") etc. just use data timestampt when the text is added

yes, the tool should have both methods. (answering your question 1). Yes, when extracting
ask it to extract sentiment and context type. the torage should be per user and for the
minimum threshold connect on first co-occurence

---

## Additional Questions/Requests

1. can you make the codebase so that it uses groq for the ai provider rather than openai?

2. so i have to make a .dev.vars file then?

3. what is this error? [workflow binding error]

4. so lets say i just say 'oh i found this article interesting' itll do the auto extraction and knowledge base creation right?

5. got these errors - Error adding to knowledge graph: AI_APICallError: This model does not support response format 'json_schema'

6. ok, go ahead and switch [to different model]

7. ok, instead of groq, lets try Gemini 2.0 Flash-Lite 30 and use the gemini api instead of groq

8. the knowledge query tool doesn't work - queryType: 'get_user_interests', Result: '{\n  "interests": []\n}'

9. i don't see the knowledge graph tester

10. got an error - 3:12:46 PM [vite] (client) Pre-transform error... [TypeScript parsing error]

11. what is this issue? - 3:17:28 PM [vite] Internal server error... [another TypeScript error]

12. nope getting more errors [third TypeScript error]

13. env.db doesn't exist - const { KnowledgeGraphManager } = await import("./knowledge_graph"); const manager = new KnowledgeGraphManager(userId || "default_user", env.DB); const result = await manager.queryGraph(queryType, params || {}); - what could be causing this error - don't write code read through the codebase and tell me why this could be happening

14. check to see if the type is now there

15. stop the background task

16. now what is the issue? localhost doesn't even load - Uncaught TypeError: Cannot read properties of undefined (reading 'map')... [Select component error]

17. can we get rid of the "has open ai key" im not using that - use only gemini

18. ok, so now the testing - run query - doesn't work - this is the output - { "interests": [] } - tell me how the query works

19. is it possible that the ai or llm can add to interests according to user interest. if i saw or show that i am interested in something it should add those topics right? i shouldn't have to tell it manually - "im interested in this" rather it should infer from the content and topic im giving it
