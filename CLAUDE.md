# CLAUDE.md

`@vectorplease/mcp`: the public MCP server for Vector, Please. MIT.

## Rules

- This server talks to the API only through `@vectorplease/sdk`. Never call the API directly, and
  never import, name, or describe any non-public package or service internals. CI fails on it
  (`pnpm leak-guard`).
- Tools: `convert_image`, `get_conversion`, `list_presets`. Transports: stdio and streamable HTTP.
- Every change ships tests, using the MCP SDK's in-memory client and a fake SDK. Never weaken a
  test to make it pass.
- Conventional Commits. Feature work goes through a PR. Add a changeset for anything users see.
- Never publish to npm or change repo settings; a human does that.

## Commands

```
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm build
```
