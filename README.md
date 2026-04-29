# Glyph AI

> An agentic coding assistant for VS Code that knows your codebase before you say anything.

![Version](https://img.shields.io/badge/version-0.0.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![VS Code](https://img.shields.io/badge/VS%20Code-1.85%2B-blue)
![Marketplace](https://img.shields.io/badge/marketplace-published-brightgreen)

---

## The Problem

Every AI coding tool starts cold. You re-explain your stack, your conventions, your architecture — every single session. Context lives in someone else's cloud, costs tokens on every call, and disappears the moment you close the window.

Cursor costs $20/month on top of your API usage. Copilot doesn't understand your project's decisions, only its files. Neither remembers what you told them last week.

---

## What Glyph Does Differently

Glyph builds a compressed **brain file** for your project — a persistent, local knowledge base that captures your stack, conventions, fragile files, and past decisions. Every session, the agent loads this brain first. It already knows your codebase before you type a single character.

- **No cold starts** — context persists across every session
- **BYOK** — bring your own API keys, Glyph never touches your tokens
- **Local first** — everything runs on your machine, zero cloud dependency
- **Full approval workflow** — nothing touches your code without explicit confirmation
- **Model agnostic** — NVIDIA NIM, OpenAI, Anthropic, or local Ollama

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    VS Code Extension                 │
│                                                     │
│  ┌──────────┐    ┌──────────────┐    ┌───────────┐  │
│  │ WebView  │◄──►│  Agent Loop  │◄──►│ Providers │  │
│  │  Panel   │    │              │    │           │  │
│  └──────────┘    │ 1. LOAD      │    │ • NVIDIA  │  │
│                  │ 2. PLAN      │    │ • OpenAI  │  │
│  ┌──────────┐    │ 3. ACT       │    │ • Anthropic│ │
│  │  Brain   │◄──►│ 4. VERIFY    │    │ • Ollama  │  │
│  │  System  │    │ 5. UPDATE    │    └───────────┘  │
│  │          │    │ 6. REPORT    │                   │
│  │ brain.md │    └──────────────┘    ┌───────────┐  │
│  │ meta.json│                        │  KeyStore │  │
│  │config.json                        │ SecretAPI │  │
│  └──────────┘                        └───────────┘  │
└─────────────────────────────────────────────────────┘
                         │
                ┌────────▼────────┐
                │   .glyph/       │
                │   brain.md      │  ← persists across sessions
                │   sessions.db   │  ← SQLite task history
                │   config.json   │  ← per-project model config
                └─────────────────┘
```

---

## Installation

### From VS Code Marketplace
Search **"Glyph AI"** in the Extensions panel (`Ctrl+Shift+X`) or install directly:

```
ext install kshitij-shresth.glyph-ai
```

### From VSIX
```bash
code --install-extension glyph-0.0.1.vsix
```

---

## Setup

### 1. Get a Free API Key
Glyph defaults to **NVIDIA NIM** which has a free tier sufficient for heavy daily use.

- Go to [build.nvidia.com](https://build.nvidia.com)
- Sign up → Profile → API Keys → Generate Key

### 2. Configure Provider
```
Ctrl+Shift+P → "Preferences: Open Settings" → search "glyph"
```

| Setting | Value |
|---|---|
| `glyph.defaultProvider` | `nvidia` |
| `glyph.defaultModel` | `meta/llama-3.1-70b-instruct` |

### 3. Store Your Key
```
Ctrl+Shift+P → "Glyph: Configure NVIDIA Key"
```
Keys are stored in VS Code's native **SecretStorage** (OS keychain backed). Never written to disk in plaintext.

### 4. Build The Brain
Open a project folder, then:
```
Ctrl+Shift+P → "Glyph: Build Brain"
```
Glyph crawls your repo (up to 200 files), analyzes structure, and writes `.glyph/brain.md`. This is your project's persistent knowledge base. Takes 30–60 seconds depending on repo size.

### 5. Open Glyph
```
Ctrl+Shift+K
```

---

## The Brain File

`.glyph/brain.md` is the core of Glyph. It's a compressed, human-readable document that the agent loads at the start of every session.

```markdown
## Stack
Next.js 14, TypeScript, Postgres via Prisma, deployed on Railway.
Styling with Tailwind. Auth via NextAuth with JWT.

## Architecture
App router pattern. API routes in /app/api, shared logic in /lib.
Database access only through /services layer, never direct from components.

## Conventions
- Components: PascalCase in /components, co-located styles
- API routes: always validate input with zod before processing
- Error handling: never swallow errors, always propagate to UI

## Key Files
- /lib/auth.ts → JWT config and session logic. DO NOT modify expiry values.
- /services/billing.ts → Stripe webhook handler. Fragile, verify before editing.
- /app/api/users/route.ts → Main user CRUD. Check rate limiting middleware.

## Past Decisions
- [2026-01-15] Moved auth to middleware — broke /api/admin temporarily, fixed
- [2026-01-22] Established idempotency key pattern for all Stripe calls

## Open Questions
- Caching strategy not yet decided
- Mobile breakpoints deferred to v2
```

**You can edit this file freely.** Add context the AI missed, flag files as fragile, document decisions. Glyph appends to it after every successful task automatically.

---

## Agent Loop

When you give Glyph a coding task, it runs a structured execution cycle:

```
LOAD    ─► reads .glyph/brain.md as base context
  │
PLAN    ─► generates a JSON plan with typed steps
  │         { type: "read" | "edit" | "create" | "delete" }
  │
ACT     ─► executes each step sequentially
  │         reads files into context, stages edits
  │
VERIFY  ─► model self-checks each edit against intent
  │         aborts if confidence < threshold
  │
APPROVE ─► shows VS Code diff for every changed file
  │         you approve or reject each file individually
  │
UPDATE  ─► appends task summary to brain.md Past Decisions
  │
REPORT  ─► streams summary back to panel
```

Hard limits: max 10 steps per task, max 3 verify retries, 60s timeout per model call. All cancellable via `AbortController`.

---

## Supported Providers

| Provider | Default Model | Config Key |
|---|---|---|
| NVIDIA NIM | `meta/llama-3.1-70b-instruct` | `nvidia` |
| OpenAI | `gpt-4o` | `openai` |
| Anthropic | `claude-sonnet-4-20250514` | `anthropic` |
| Ollama (local) | `codellama` | `ollama` |

Per-project provider config lives in `.glyph/config.json`:
```json
{
  "provider": "nvidia",
  "model": "meta/llama-3.1-70b-instruct",
  "maxSteps": 10,
  "autoUpdateBrain": true,
  "streamResponses": true
}
```

---

## Commands

| Command | Keybinding | Description |
|---|---|---|
| `Glyph: Start` | `Ctrl+Shift+K` | Open Glyph panel |
| `Glyph: Build Brain` | — | Analyze project, create brain file |
| `Glyph: Rebuild Brain` | — | Force full brain rebuild |
| `Glyph: View Brain` | — | Open brain.md in editor |
| `Glyph: Plan Task` | — | Generate plan without executing |
| `Glyph: Execute Plan` | — | Execute last generated plan |
| `Glyph: Configure NVIDIA Key` | — | Store NVIDIA NIM API key |
| `Glyph: Configure OpenAI Key` | — | Store OpenAI API key |
| `Glyph: Configure Anthropic Key` | — | Store Anthropic API key |
| `Glyph: Configure Ollama URL` | — | Set local Ollama endpoint |

---

## Project Structure

```
src/
├── extension.ts              # Activation, command registration, status bar
├── storage/
│   └── secrets.ts            # VS Code SecretStorage wrapper for API keys
├── providers/
│   ├── index.ts              # Model router, reads .glyph/config.json
│   ├── nvidia.ts             # NVIDIA NIM via OpenAI-compatible API
│   ├── openai.ts             # OpenAI chat completions
│   ├── anthropic.ts          # Anthropic messages API
│   └── local.ts              # Ollama local inference
├── brain/
│   ├── crawler.ts            # Repo walker, file prioritization, 200 file limit
│   ├── builder.ts            # AI-powered brain.md generation
│   └── updater.ts            # Post-task brain append logic
├── agent/
│   └── loop.ts               # Core plan → act → verify → update cycle
└── webview/
    ├── panel.ts              # WebviewPanel host, message bus
    └── ui/
        ├── index.html        # Chat interface
        ├── style.css         # Dark terminal design
        └── client.js         # Webview ↔ extension messaging
```

---

## Local Development

### Prerequisites
- Node.js 18+
- VS Code 1.85+

### Setup
```bash
git clone https://github.com/kshitij-shresth/glyph
cd glyph
npm install
```

### Run in Dev Mode
```bash
# Open in VS Code
code .

# Press F5 — launches Extension Development Host
# Ctrl+Shift+F5 to hot reload after changes
```

### Build
```bash
npm run compile     # development build
npm run package     # production build (webpack --mode production)
```

### Package
```bash
npm install -g @vscode/vsce
vsce package
# produces glyph-x.x.x.vsix
```

---

## Configuration Reference

All settings available under `Ctrl+Shift+P → Preferences: Open Settings → search "glyph"`:

| Setting | Type | Default | Description |
|---|---|---|---|
| `glyph.defaultProvider` | string | `ollama` | AI provider to use |
| `glyph.defaultModel` | string | `codellama` | Model identifier |
| `glyph.maxSteps` | number | `10` | Max agent steps per task |
| `glyph.autoUpdateBrain` | boolean | `true` | Auto-update brain after tasks |
| `glyph.streamResponses` | boolean | `true` | Stream model output to panel |

---

## Privacy & Security

- **No telemetry.** Glyph collects nothing.
- **No cloud backend.** All state is local — SQLite, flat files, OS keychain.
- **Keys never leave your machine** except in direct API calls to your chosen provider.
- **`.glyph/` is auto-added to `.gitignore`** on first brain build. Your brain file never gets committed.
- Model calls go directly from your machine to your provider. Glyph is not a proxy.

---

## Roadmap

- [ ] `db.ts` — SQLite session history for cross-session task memory
- [ ] `updater.ts` — Automatic brain evolution after each task
- [ ] OpenAI + Anthropic provider verification
- [ ] Retrieval-augmented context for repos > 200 files
- [ ] Multi-model routing (orchestrator delegates subtasks)
- [ ] JetBrains port

---

## Contributing

PRs welcome. For significant changes open an issue first.

```bash
git clone https://github.com/kshitij-shresth/glyph
cd glyph
npm install
# make changes
# F5 to test in Extension Development Host
# open PR
```

---

## License

MIT — see [LICENSE](LICENSE)

---

*Built with NVIDIA NIM free tier as the default provider. No subscription required to get started.*
