# Verifiable Conversation Handles — TypeScript Reference

> **Experimental extension** — Reference implementation of the draft SEP
> `tools.plasm/conversation-handle`. Not an official MCP extension. API and wire
> format may change before review.

Implements the RECOMMENDED §6.2 symmetric encoding, server mint/rotate/verify,
opaque client persistence, and a conformance-style e2e suite with `sep-0000.yaml`
traceability.

## Quick start

```bash
npm install
npm test
pnpm run example:server
```

## Packages

| Path | Role |
|------|------|
| `src/schema/draft/schema.ts` | Wire types + settings (ext-tasks style) |
| `src/codec.ts` | HMAC-SHA256 handle construction and verification |
| `src/extension.ts` | `conversationHandlePlugin()` — presentation union + `invokeToolHandler()` |
| `src/integrate.ts` | `registerConversationTools()` for MCP servers |
| `src/fixtures/` | Shared memory tools + `createConversationFixtureApp()` |
| `src/http-server.ts` | `serveMcp()` / `serveMcpEphemeral()` helpers |
| `src/client.ts` | Opaque per-conversation handle persistence |
| `examples/reference-server/` | Streamable HTTP fixture (shared manager lifetime) |
| `conformance/` | E2E scenarios + `sep-0000.yaml` |

## Extension identifier

`tools.plasm/conversation-handle`

## Normative scope

Only the **Specification** section of [conversation-identity-sep-draft.md](./conversation-identity-sep-draft.md) is tested. This is an opt-in extension on MCP 2026-07-28; non-participating peers are unaffected.
