---
'@blinkk/root-cms': minor
---

ai: stream the Root AI chat directly from the browser

SSE streaming proxied through the server did not work on App Engine Standard
and Firebase Hosting, which buffer responses. The `/cms/ai` chat, the
document-editor AI panel, and the "Edit with AI" modal now call the configured
provider (OpenAI / Google / Anthropic) **directly from the browser** using the
Vercel AI SDK. For Anthropic the client sends the
`anthropic-dangerous-direct-browser-access: true` header; OpenAI and Google's
`generativelanguage` endpoint already allow browser calls with an API key.

What changed:

- New non-streaming `/cms/api/ai.chat.prepare` and `/cms/api/ai.edit.prepare`
  endpoints assemble the system prompt (including `ROOT.md`) and return the
  selected model's connection config. The streaming `/cms/api/ai.chat` and
  `/cms/api/ai.edit_object` endpoints were removed.
- Chat history is now read/written directly from the browser
  (`Projects/{projectId}/AiChats`); the `/cms/api/ai.chats.*` endpoints were
  removed.
- Read tools run client-side via the Firebase web SDK; write tools keep the
  existing approval flow.
- The one-shot helpers (diff summaries, publish messages, translations, alt
  text, image generation) still run server-side, so their API keys stay on the
  server.

Action required:

- The selected chat model's API key is delivered to the authenticated CMS
  client. Use provider keys that are scoped/billed for this trusted, signed-in
  audience.
- Ensure your project's Firestore security rules allow a signed-in user to read
  and write their own chat documents under `Projects/{projectId}/AiChats`
  (matched on the `createdBy` field). Without this, chats still work but won't
  be saved.
