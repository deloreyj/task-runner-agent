# Agentic Task Runner

A minimal example of running AI coding agents in sandboxed containers. Give it a GitHub repo and a prompt, and watch an AI agent work on the task in real-time.

## How It Works

1. **User submits a task** - Provide a GitHub repo URL and describe what you want done
2. **Sandbox spins up** - A Cloudflare Sandbox container clones the repo
3. **Agent starts working** - OpenCode CLI runs inside the container with your prompt
4. **Watch in real-time** - SSE streams agent activity to the browser
5. **Review changes** - View the git diff of what the agent modified

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
│   React UI      │────▶│  Cloudflare Worker   │────▶│  Sandbox Container  │
│                 │     │  (Hono API)          │     │                     │
│  - Task form    │◀────│  - /api/tasks        │◀────│  - Git clone        │
│  - Event stream │ SSE │  - /api/tasks/:id/*  │     │  - OpenCode CLI     │
│  - Diff viewer  │     │                      │     │  - Agent execution  │
└─────────────────┘     └──────────────────────┘     └─────────────────────┘
```

### Key Components

- **Worker** (`src/worker/`) - Hono API that manages sandbox lifecycle
- **Sandbox** - Cloudflare container running OpenCode CLI
- **React App** (`src/react-app/`) - UI for submitting tasks and viewing progress

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/tasks` | POST | Create a new task (clone repo, start agent) |
| `/api/tasks/:id/events` | GET | SSE stream of agent activity |
| `/api/tasks/:id/diff` | GET | Get git diff of changes |
| `/api/tasks/:id/abort` | POST | Stop the agent (requires `?sessionId=`) |

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Cloudflare account with Workers and Sandbox access

### Installation

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build & Deploy

```bash
pnpm build
pnpm deploy
```

## Configuration

### Dockerfile.sandbox

The sandbox container is built from `Dockerfile.sandbox`:

```dockerfile
FROM docker.io/cloudflare/sandbox:0.5.3
RUN npm install -g opencode-ai
```

### Cloudflare WARP Certificate Setup

If you're running behind Cloudflare WARP, OpenCode's outbound API calls will fail with SSL certificate errors unless the WARP CA certificate is trusted inside the container.

To fix this, create `src/internal-scripts/install-cloudflare-warp-certs.sh` and ask a teammate for the contents

The Dockerfile will automatically run this script if it exists. The script is gitignored since it's only needed for internal Cloudflare development.

### Environment Variables

The OpenCode process in the sandbox uses:
- `NODE_EXTRA_CA_CERTS` - Points to the Cloudflare CA cert for Node.js
- `NODE_TLS_REJECT_UNAUTHORIZED=0` - Fallback for proxy environments where cert installation isn't sufficient

## Usage via cURL

You can interact with the API directly without the UI:

### Create a task

```bash
curl -X POST http://localhost:5173/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "repoUrl": "https://github.com/user/repo",
    "branch": "main",
    "prompt": "Add a README.md file explaining this project"
  }'
```

Response:
```json
{
  "data": {
    "id": "task-1234567890-abc123",
    "status": "running",
    "sessionId": "ses_abc123...",
    "repoUrl": "https://github.com/user/repo",
    "branch": "main",
    "prompt": "Add a README.md file explaining this project",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "startedAt": "2025-01-01T00:00:01.000Z"
  }
}
```

### Stream events

```bash
curl -N http://localhost:5173/api/tasks/task-1234567890-abc123/events
```

This returns an SSE stream of agent activity:
```
data: {"type":"session.status","properties":{"status":{"type":"busy"}}}
data: {"type":"message.part.updated","properties":{"delta":"I'll help you..."}}
data: {"type":"tool.start","properties":{"part":{"tool":"write"}}}
...
```

### Get the diff

```bash
curl http://localhost:5173/api/tasks/task-1234567890-abc123/diff
```

Response:
```json
{
  "data": {
    "diff": "diff --git a/README.md b/README.md\n+# My Project\n+...",
    "taskId": "task-1234567890-abc123"
  }
}
```

### Abort a task

```bash
curl -X POST "http://localhost:5173/api/tasks/task-1234567890-abc123/abort?sessionId=ses_abc123..."
```

## Project Structure

```
src/
├── worker/
│   ├── index.ts        # Worker entry point
│   └── tasks-app.ts    # Task management API
├── react-app/
│   ├── pages/
│   │   ├── HomePage.tsx   # Task creation form
│   │   └── TaskPage.tsx   # Live task view
│   └── hooks/
│       ├── use-task.ts        # Task mutations
│       ├── use-task-events.ts # SSE subscription
│       └── use-task-diff.ts   # Diff fetching
└── types/
    ├── task-schemas.ts     # API types & validation
    └── opencode-events.ts  # SSE event types
```

## License

See [LICENSE](./LICENSE) file for details.
