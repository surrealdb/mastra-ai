-- Threads
DEFINE TABLE IF NOT EXISTS mastra_threads SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id          ON mastra_threads TYPE string;
DEFINE FIELD IF NOT EXISTS resourceId  ON mastra_threads TYPE string;
DEFINE FIELD IF NOT EXISTS title       ON mastra_threads TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata    ON mastra_threads TYPE option<object> FLEXIBLE;
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
DEFINE FIELD IF NOT EXISTS content     ON mastra_messages TYPE object FLEXIBLE;
DEFINE FIELD IF NOT EXISTS createdAt   ON mastra_messages TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_messages_thread   ON mastra_messages FIELDS threadId, createdAt;
DEFINE INDEX IF NOT EXISTS idx_messages_resource ON mastra_messages FIELDS resourceId;
DEFINE INDEX IF NOT EXISTS idx_messages_ids      ON mastra_messages FIELDS id;

-- Resources (working memory)
DEFINE TABLE IF NOT EXISTS mastra_resources SCHEMAFULL;
DEFINE FIELD IF NOT EXISTS id            ON mastra_resources TYPE string;
DEFINE FIELD IF NOT EXISTS workingMemory ON mastra_resources TYPE option<string>;
DEFINE FIELD IF NOT EXISTS metadata      ON mastra_resources TYPE option<object> FLEXIBLE;
DEFINE FIELD IF NOT EXISTS createdAt     ON mastra_resources TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt     ON mastra_resources TYPE datetime;

-- Observational memory (one row per generation)
DEFINE TABLE IF NOT EXISTS mastra_observational_memory SCHEMALESS;
DEFINE FIELD IF NOT EXISTS id                            ON mastra_observational_memory TYPE string;
DEFINE FIELD IF NOT EXISTS scope                         ON mastra_observational_memory TYPE string;
DEFINE FIELD IF NOT EXISTS threadId                      ON mastra_observational_memory TYPE option<string>;
DEFINE FIELD IF NOT EXISTS resourceId                    ON mastra_observational_memory TYPE string;
DEFINE FIELD IF NOT EXISTS originType                    ON mastra_observational_memory TYPE string;
DEFINE FIELD IF NOT EXISTS generationCount               ON mastra_observational_memory TYPE int;
DEFINE FIELD IF NOT EXISTS activeObservations            ON mastra_observational_memory TYPE string;
DEFINE FIELD IF NOT EXISTS bufferedObservationChunks     ON mastra_observational_memory TYPE option<array<object>>;
DEFINE FIELD IF NOT EXISTS bufferedReflection            ON mastra_observational_memory TYPE option<string>;
DEFINE FIELD IF NOT EXISTS bufferedReflectionTokens      ON mastra_observational_memory TYPE option<number>;
DEFINE FIELD IF NOT EXISTS bufferedReflectionInputTokens ON mastra_observational_memory TYPE option<number>;
DEFINE FIELD IF NOT EXISTS reflectedObservationLineCount ON mastra_observational_memory TYPE option<number>;
DEFINE FIELD IF NOT EXISTS observedMessageIds            ON mastra_observational_memory TYPE option<array<string>>;
DEFINE FIELD IF NOT EXISTS observedTimezone              ON mastra_observational_memory TYPE option<string>;
DEFINE FIELD IF NOT EXISTS totalTokensObserved           ON mastra_observational_memory TYPE number;
DEFINE FIELD IF NOT EXISTS observationTokenCount         ON mastra_observational_memory TYPE number;
DEFINE FIELD IF NOT EXISTS pendingMessageTokens          ON mastra_observational_memory TYPE number;
DEFINE FIELD IF NOT EXISTS isReflecting                  ON mastra_observational_memory TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS isObserving                   ON mastra_observational_memory TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS isBufferingObservation        ON mastra_observational_memory TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS isBufferingReflection         ON mastra_observational_memory TYPE bool DEFAULT false;
DEFINE FIELD IF NOT EXISTS lastBufferedAtTokens          ON mastra_observational_memory TYPE number DEFAULT 0;
DEFINE FIELD IF NOT EXISTS lastBufferedAtTime            ON mastra_observational_memory TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS lastObservedAt                ON mastra_observational_memory TYPE option<datetime>;
DEFINE FIELD IF NOT EXISTS config                        ON mastra_observational_memory TYPE object;
DEFINE FIELD IF NOT EXISTS metadata                      ON mastra_observational_memory TYPE option<object>;
DEFINE FIELD IF NOT EXISTS createdAt                     ON mastra_observational_memory TYPE datetime;
DEFINE FIELD IF NOT EXISTS updatedAt                     ON mastra_observational_memory TYPE datetime;
DEFINE INDEX IF NOT EXISTS idx_om_thread   ON mastra_observational_memory FIELDS threadId, generationCount, createdAt;
DEFINE INDEX IF NOT EXISTS idx_om_resource ON mastra_observational_memory FIELDS resourceId, generationCount, createdAt;
DEFINE INDEX IF NOT EXISTS idx_om_id       ON mastra_observational_memory FIELDS id;
