# AGENTS.md
Guidance for coding agents operating in this repository.

## 1) Project Snapshot
- Stack: Electron + React 18 + TypeScript + Vite.
- Package manager: npm (`package-lock.json` is source of truth).
- Main app folders:
  - Renderer UI: `src/**`
  - Electron processes: `electron/**`
- Build/config files: `vite.config.ts`, `electron-builder.json5`, `tsconfig*.json`, `.eslintrc.cjs`.
- TypeScript is strict and checks for unused locals/params.
- ESLint uses TypeScript + React Hooks + react-refresh rules.

## 2) Canonical Commands
Run commands from repo root: `/Users/hugsun/vibe/livelingo`.

### Install
- `npm ci`

### Develop
- `npm run dev`
  - Starts Vite + Electron workflow via `vite-plugin-electron`.

### Build
- `npm run build`
  - Exact pipeline: `tsc && vite build && electron-builder`.
  - Produces both renderer build and packaged Electron artifacts.

### Lint
- `npm run lint`
  - Exact command: `eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`.

### Preview
- `npm run preview`

## 3) Targeted Commands (Fast Iteration)
- Lint one file:
  - `npx eslint src/components/Home.tsx`
  - `npx eslint electron/main.ts`
- Type-check project without emit:
  - `npx tsc --noEmit`
- There is no dedicated per-file TypeScript project config; use full `npx tsc --noEmit`.

## 4) Test Commands (Current State)
- No `test` script exists in `package.json`.
- No Vitest/Jest/Playwright config files are present.
- Result: there is currently no runnable test suite and no single-test command.

If tests are added, prefer Vitest command shapes:
- All tests: `npx vitest run`
- Single file: `npx vitest run src/foo/bar.test.ts`
- Single test case by name: `npx vitest run -t "test name"`

## 5) Source-of-Truth Order
When instructions conflict, follow:
1. Explicit user request
2. This `AGENTS.md`
3. `.eslintrc.cjs`
4. `tsconfig.json` / `tsconfig.node.json`
5. Existing nearby code patterns

## 6) Cursor / Copilot Rules
Checked rule files:
- `.cursorrules`: not present
- `.cursor/rules/`: not present
- `.github/copilot-instructions.md`: not present

No additional Cursor/Copilot instruction files are active.

## 7) Code Style Guidelines
Use repository conventions over personal preference.

### 7.1 Imports
- Keep imports at top of file.
- Prefer grouping order:
  1) Node built-ins
  2) Third-party packages
  3) Internal relative imports (`./`, `../`)
  4) Side-effect imports (e.g. CSS)
- Remove unused imports and unused specifiers.
- Avoid dynamic imports unless required by runtime behavior.

### 7.2 Formatting
- Match the edited file's existing style (semicolon usage currently mixed).
- Do not perform broad formatting-only refactors unless requested.
- Keep JSX readable; wrap long prop lists onto multiple lines.
- Keep whitespace and trailing commas consistent with local file style.

### 7.3 TypeScript
- Keep strict-mode compatibility.
- Avoid `any`; if unavoidable, constrain and document briefly.
- Prefer explicit interfaces/types for public contracts:
  - service interfaces
  - IPC payloads/channels
  - shared data shapes
- Preserve `noUnusedLocals` and `noUnusedParameters` cleanliness.
- Use non-null assertion (`!`) only when guaranteed safe.

### 7.4 Naming
- Components/classes: `PascalCase` (e.g. `OpenAiSttService`).
- Variables/functions: `camelCase`.
- Constants: `UPPER_SNAKE_CASE` for true constants only.
- File naming:
  - Components: `PascalCase.tsx`
  - Services/utils: follow existing local convention (`kebab-case.ts` where used).
- Prefer descriptive domain names (`sttProvider`, `aliyunApiKey`, etc.).

### 7.5 React / Renderer
- Use functional components and hooks.
- Put side effects in `useEffect` with cleanup when needed.
- Wrap async UI flows in `try/catch` with user-safe feedback.
- Keep state local unless clear sharing is needed.
- Prefer typed handlers/events when straightforward.

### 7.6 Electron / IPC
- Keep privileged logic and secrets in main process.
- Expose minimal surface via `contextBridge` in `preload.ts`.
- Keep IPC channel names stable and descriptive.
- Validate inputs in main process before use.
- Do not expose broad Node APIs to renderer by default.

### 7.7 Error Handling and Logging
- Fail early on missing prerequisites (permissions, API keys, devices).
- Catch and log actionable context with `console.error`.
- Re-throw when caller-level recovery is required.
- Keep UI error messages concise and free of sensitive data.

### 7.8 Security and Secrets
- Never hardcode secrets (API keys, tokens, credentials).
- Never commit secret files/values.
- Treat persisted `window.store` values as sensitive.

## 8) Agent Workflow Expectations
- Before finalizing code changes, run:
  - `npm run lint`
  - `npx tsc --noEmit`
- Also run `npm run build` when touching build pipeline, packaging, or renderer/main boundaries.
- Keep diffs scoped; avoid unrelated cleanup.
- Update docs when behavior or commands change.

## 9) Definition of Done
- TypeScript checks pass.
- ESLint passes with zero warnings.
- Touched behavior is manually validated.
- Command/documentation changes are reflected in docs.
- No secrets or generated artifacts are accidentally committed.
