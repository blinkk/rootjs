# Root.js CMS

Root.js is a developer-focused CMS that writes directly to Firestore. This
project is still in early development, stay tuned to learn more!

## Development

This project uses [PNPM](https://pnpm.io/). Install it using `npm install -g pnpm`.

Project setup:

```shell
git clone git@github.com:blinkk/cms.git
cd cms
pnpm install
```

Copy `.env.local.example` to `.env.local` and populate it with an API key from firebase.

Start the dev server:

```shell
pnpm run dev
```

And then visit: http://localhost:3000/cms/
