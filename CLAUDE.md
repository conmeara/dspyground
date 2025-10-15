# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DSPyground is a prompt optimization harness powered by GEPA (Genetic-Pareto Evolutionary Algorithm). It's a Next.js application with a CLI wrapper that allows users to install it into their existing AI SDK agent repositories, import tools and prompts, sample agent behavior trajectories, and run automated prompt optimization.

## Development Commands

### Setup
```bash
npm install                    # Install dependencies
npx dspyground init           # Initialize .dspyground/data and config (user-facing)
```

### Development
```bash
npm run dev                    # Start Next.js dev server
npm run dev:cli               # Run CLI with tsx (for CLI development)
npx dspyground dev            # Run via CLI (production mode)
```

### Build
```bash
npm run build                 # Full build: CLI + Next.js + standalone prep
npm run build:cli             # Build CLI only with tsup
npm run build:server          # Build Next.js server only
npm run clean                 # Clean dist, .next, and build artifacts
```

### Testing
```bash
npm run test:metrics          # Test metrics evaluation system
npm run lint                  # Run ESLint
```

## Architecture

### Dual Mode Operation

DSPyground operates in two distinct modes:

1. **Development Mode** (`npm run dev`): Runs directly from source in the repo itself
2. **User Mode** (`npx dspyground dev`): Runs as an installed package in a user's project

**Data Directory Resolution** (`src/lib/config-loader.ts:73-95`):
- User mode: `.dspyground/data/` in user's project
- Dev mode: `data/` in repo root (fallback)
- Override: `DSPYGROUND_DATA_DIR` env var

**Config File Loading** (`src/lib/config-loader.ts:14-71`):
- Uses `jiti` to load TypeScript config files at runtime
- Searches for `dspyground.config.ts` in user's working directory
- Override: `DSPYGROUND_CONFIG_PATH` env var
- Caches config after first load

### CLI Architecture

**Entry point**: `cli/index.ts` - Commander-based CLI with two commands:

1. **`init`** (`cli/init.ts`):
   - Creates `.dspyground/data/` directory structure
   - Copies config template from `templates/dspyground.config.ts.template`
   - Initializes default JSON files (samples, runs, preferences, schema, metrics)
   - Updates `.gitignore`

2. **`dev`** (`cli/dev.ts`):
   - Validates config and data directory exist
   - Finds available port (starting from 3000)
   - Sets `DSPYGROUND_DATA_DIR` and `DSPYGROUND_CONFIG_PATH` env vars
   - Spawns either:
     - **Production**: `.next/standalone/work/dspyground/server.js` (from build)
     - **Development**: `npx next dev` (if src/ exists)

### API Routes (Next.js)

All routes in `src/app/api/`:

- **`/api/chat`**: Main chat interface with AI SDK streaming, supports both text and structured output modes, loads user tools from config
- **`/api/optimize`**: GEPA optimization endpoint with Server-Sent Events streaming
- **`/api/samples`**: CRUD for trajectory samples (organized by groups)
- **`/api/sample-groups`**: Manage sample groups
- **`/api/runs`**: Optimization run history
- **`/api/prompt`**: Read/write `.dspyground/data/prompt.md`
- **`/api/schema`**: Read/write `.dspyground/data/schema.json` (for structured output)
- **`/api/preferences`**: User preferences (models, batch size, metrics selection)
- **`/api/metrics-prompt`**: Configurable evaluation criteria
- **`/api/models`**: List available models from AI Gateway
- **`/api/factory-reset`**: Reset all data to defaults

### GEPA Optimization Engine

**Core implementation**: `src/app/api/optimize/route.ts:499-808`

The optimization loop works as follows:

1. **Initialization**:
   - Load samples from `.dspyground/data/samples.json`
   - Load seed prompt from `.dspyground/data/prompt.md`
   - Evaluate seed prompt on random batch → initialize Pareto frontier

2. **Main Loop** (for `numRollouts` iterations):
   - Select best prompt from Pareto frontier (`selectPrompt`)
   - Sample random batch (with replacement)
   - Generate trajectories using current prompt (`generateTrajectoryForSample`)
   - Evaluate with reflection model (`evaluateBatch` → `judgeAndScoreSample`)
   - Synthesize improvement prompt (`improvePrompt`)
   - Test improved prompt on same batch
   - If improved: update Pareto frontier (`updateParetoFrontier`)
   - Stream progress via Server-Sent Events

3. **Pareto Frontier**:
   - Maintains set of non-dominated solutions across all metrics
   - Domination check: candidate A dominates B if A is ≥ B in all dimensions and strictly better in at least one
   - Function: `dominates()` at `src/app/api/optimize/route.ts:414-435`

4. **Results**:
   - Final prompt saved to `.dspyground/data/prompt.md`
   - Full run history saved to `.dspyground/data/runs.json`

### Metrics and Evaluation

**Reflection-based scoring**: `src/lib/metrics.ts:157-264`

- **5 Dimensions**: tone, accuracy, efficiency, tool_accuracy, guardrails
- **LLM-as-Judge**: Uses structured output (Zod schema) to evaluate trajectories
- **Dual Feedback Types**:
  - **Positive samples**: Compare generated trajectory to reference (should match/exceed quality)
  - **Negative samples**: Check generated trajectory avoids issues mentioned in feedback
- **Configurable**: Evaluation instructions and dimension weights in `.dspyground/data/metrics-prompt.json`

**Evaluation Schema**: `src/lib/metrics.ts:33-84` (Zod schema for structured LLM output)

### Data Files

All data stored in `.dspyground/data/` (or `data/` in dev mode):

- **`prompt.md`**: Current system prompt (text file)
- **`samples.json`**: Trajectory samples organized by groups
  ```json
  {
    "groups": [{"id": "default", "name": "Default Group", "samples": [...]}],
    "currentGroupId": "default"
  }
  ```
- **`runs.json`**: Optimization history
  ```json
  {
    "runs": [{
      "id": "abc123",
      "timestamp": "2024-...",
      "config": {...},
      "prompts": [{iteration, prompt, accepted, score, metrics}],
      "finalPrompt": "...",
      "bestScore": 0.85,
      "samplesUsed": ["sample-id-1", ...],
      "status": "completed"
    }]
  }
  ```
- **`preferences.json`**: UI state and optimization config
- **`schema.json`**: JSON schema for structured output mode
- **`metrics-prompt.json`**: Customizable evaluation criteria

### Build Process

**Multi-stage build** (`package.json:35-39`):

1. **Clean**: Remove `dist/`, `.next/`, build artifacts
2. **Build CLI**: Use `tsup` to bundle `cli/*.ts` → `dist/cli/*.mjs` with DTS
3. **Build Server**: `next build` (creates `.next/`)
4. **Prepare Standalone**: `scripts/prepare-standalone.mjs` - copies `.next/static` and `public/` into standalone build
5. **Clean Sensitive**: `scripts/clean-sensitive.mjs` - removes `.env` from standalone (security)

**Standalone Mode**: Next.js output configured for standalone deployment (`next.config.ts`), allows CLI to run bundled server without `node_modules`

### AI SDK Integration

**User Tool Loading** (`src/lib/config-loader.ts`):
- User defines tools in `dspyground.config.ts`
- Tools are imported using `jiti` (handles TypeScript at runtime)
- Tools passed to AI SDK's `generateText()` during optimization and chat

**Streaming**:
- Chat: Uses AI SDK's `useChat` hook on frontend
- Optimization: Custom SSE streaming for progress updates
- Structured output: Uses `generateObject()` with Zod schemas

### Path Aliases

TypeScript path alias `@/*` maps to `./src/*` (defined in `tsconfig.json:24-27`)

Use this consistently:
```typescript
import { loadUserConfig } from "@/lib/config-loader"  // ✓ Correct
import { loadUserConfig } from "../../../lib/config-loader"  // ✗ Avoid
```

## Key Implementation Details

### Trajectory Generation with Tools

When generating trajectories (`src/app/api/optimize/route.ts:76-229`):
- Loads user's tools from config
- Calls AI SDK's `generateText()` with tools enabled
- Captures full conversation including tool calls and results
- Formats as structured `Trajectory` with messages array

### Sample Collection Flow

1. User chats in Teaching Mode
2. Clicks + button on response to save as sample
3. Provides feedback rating (positive/negative) and optional comment
4. Sample stored in `.dspyground/data/samples.json` under current group
5. During optimization, samples are randomly batched and used for evaluation

### Metrics Configuration

Users can customize evaluation in `.dspyground/data/metrics-prompt.json`:
- Modify dimension descriptions and weights
- Adjust comparison instructions for positive vs negative feedback
- Change overall evaluation guidelines
- File structure defined at `src/lib/metrics.ts:91-150`

## Common Development Patterns

### Adding a New API Route

1. Create `src/app/api/[route]/route.ts`
2. Export `GET` and/or `POST` handlers
3. Use `getDataDirectory()` to resolve data file paths
4. Read/write JSON with proper error handling
5. Return `Response` objects (Next.js convention)

### Modifying Optimization Algorithm

Core logic in `src/app/api/optimize/route.ts`:
- `runGEPA()`: Main loop (line 499-808)
- `evaluateBatch()`: Batch evaluation (line 290-362)
- `improvePrompt()`: Reflection-based improvement (line 365-412)
- `updateParetoFrontier()`: Pareto optimality check (line 437-461)

Always maintain backward compatibility with existing `runs.json` structure.

### Streaming Progress Updates

Optimization uses SSE (Server-Sent Events):
```typescript
const encoder = new TextEncoder()
const stream = new ReadableStream({
  async start(controller) {
    const sendProgress = async (data: any) => {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
    }
    // ... optimization logic
  }
})
return new Response(stream, { headers: { "Content-Type": "text/event-stream" } })
```

Frontend consumes via `EventSource` or `useEffect` with fetch.

## Environment Variables

Required:
- `AI_GATEWAY_API_KEY`: Vercel AI Gateway API key

Optional:
- `DSPYGROUND_DATA_DIR`: Override data directory location
- `DSPYGROUND_CONFIG_PATH`: Override config file location
- `NEXT_PUBLIC_APP_URL`: App URL (defaults to localhost:3000)

## Important Constraints

1. **Backward Compatibility**: Data file formats must remain compatible with existing user data
2. **Dual Mode**: All features must work in both dev mode (repo) and user mode (installed package)
3. **Config Loading**: Must use `jiti` for dynamic TypeScript loading (no build-time imports of user code)
4. **Data Isolation**: User's `.dspyground/data/` must never be committed or published
5. **Tool Portability**: User's AI SDK tools must work in DSPyground without modification
