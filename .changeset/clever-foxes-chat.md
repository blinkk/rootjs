---
'@blinkk/root-cms': minor
---

feat: rebuild `/cms/ai` page on top of the Vercel AI SDK

The Root CMS chat UI is now powered by [`ai`](https://ai-sdk.dev/) and
`@ai-sdk/react`. Configure models via the new top-level `ai` option on
`cmsPlugin()`:

```ts
cmsPlugin({
  ai: {
    models: [
      {
        id: 'gpt-4o',
        label: 'GPT-4o',
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        capabilities: {tools: true, attachments: true},
      },
      {
        id: 'claude-opus-4-5',
        label: 'Claude Opus 4.5',
        provider: 'anthropic',
        apiKey: process.env.ANTHROPIC_API_KEY,
        capabilities: {tools: true, reasoning: true, attachments: true},
      },
      {
        id: 'llama3-local',
        label: 'Llama 3 (local)',
        provider: 'openai-compatible',
        baseURL: 'http://localhost:11434/v1',
      },
    ],
    defaultModel: 'gpt-4o',
  },
});
```

The new chat supports streaming, model picking, persistent Firestore-backed
history, image attachments, reasoning/thinking display, and CMS tool calling
(`listCollections`, `listDocs`, `getDoc`, `updateDocField`, `searchDocs`).
