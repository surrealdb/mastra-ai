-- Threads
DEFINE TABLE IF NOT EXISTS mastra_threads SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id          ON mastra_threads TYPE string;
DEFINE FIELD IF NOT EXISTS resourceId  ON mastra_threads TYPE string;
DEFINE FIELD IF NOT EXISTS title       ON mastra_threads TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata    ON mastra_threads FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt   ON mastra_threads TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt   ON mastra_threads TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_threads_resource  ON mastra_threads FIELDS resourceId;
DEFINE INDEX IF NOT EXISTS idx_threads_created   ON mastra_threads FIELDS createdAt;

-- Messages
DEFINE TABLE IF NOT EXISTS mastra_messages SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id          ON mastra_messages TYPE string;
DEFINE FIELD IF NOT EXISTS threadId    ON mastra_messages TYPE string;
DEFINE FIELD IF NOT EXISTS resourceId  ON mastra_messages TYPE option<string>;
DEFINE FIELD IF NOT EXISTS role        ON mastra_messages TYPE string;
DEFINE FIELD IF NOT EXISTS type        ON mastra_messages TYPE option<string>;
DEFINE FIELD IF NOT EXISTS content     ON mastra_messages FLEXIBLE TYPE object;
DEFINE FIELD IF NOT EXISTS createdAt   ON mastra_messages TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_messages_thread   ON mastra_messages FIELDS threadId, createdAt;
DEFINE INDEX IF NOT EXISTS idx_messages_resource ON mastra_messages FIELDS resourceId;
DEFINE INDEX IF NOT EXISTS idx_messages_ids      ON mastra_messages FIELDS id;

-- Resources (working memory)
DEFINE TABLE IF NOT EXISTS mastra_resources SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id            ON mastra_resources TYPE string;
DEFINE FIELD IF NOT EXISTS workingMemory ON mastra_resources TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata      ON mastra_resources FLEXIBLE TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt     ON mastra_resources TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt     ON mastra_resources TYPE datetime;
