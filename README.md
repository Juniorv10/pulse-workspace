\# Pulse — Distributed Real-Time Collaborative Workspace \& Workflow Engine



Pulse is a full-stack distributed engineering workspace combining \*\*CRDT multiplayer document editing\*\*, \*\*$O(1)$ fractionally indexed real-time Kanban boards\*\*, and an \*\*event-driven visual workflow engine\*\* backed by Redis queues and signed webhooks.



\## System Architecture



```mermaid

graph TD

&#x20;   Client\[Next.js 16 + TipTap + React Flow] -->|WebSocket CRDT \& Task Sync| Server\[Fastify Sync \& API Server]

&#x20;   Client -->|REST + RBAC Headers| Server

&#x20;   Server <-->|Pub/Sub Backplane| Redis\[(Redis 7)]

&#x20;   Server -->|Binary BYTEA \& Relational State| Postgres\[(PostgreSQL 16 + Drizzle ORM)]

&#x20;   Server -->|Enqueue Domain Events| BullMQ\[BullMQ Workflow Queue]

&#x20;   BullMQ --> Worker\[Node.js Background Worker]

&#x20;   Worker -->|HMAC-SHA256 Signed POST + Retries| Webhook\[External Webhook Target]

