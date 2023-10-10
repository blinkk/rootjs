# @blinkk/root

## 1.0.0-rc.0

### Major Changes

- 31723f2: feat: initial release of root.js web
- a5cb6b1: feat: first release of root.js cms

### Minor Changes

- dc095e3: feat: add custom translations rendering
- 3e3a8f0: feat: add listDocs to root-cms and add example
- 90465ff: feat: add i18n fallback locales
- fd0bf90: feat: add functions subpackage for GCF
- 8417984: feat: add --concurrency flag to build cmd
- ea71e3f: feat: add "save" button
- 3ae64e3: feat: add multipartMiddlware
- 81be985: feat: add session cookie middleware
- fe802b3: feat: use dev error pages in preview mode
- ea71e3f: feat: add meta image to collection page
- d602474: feat: export HTML_CONTEXT to core api
- 06fbcf9: feat: add currentUrl to request context
- ea71e3f: feat: use gci url as image src

### Patch Changes

- 1884ecc: feat: add config to include element dirs
- 53b316e: feat: add additional props to request context
- b92cf04: fix: add async to vite middleware
- d6e961c: feat: add prettyHtml option and fix tests
- 46a35e2: fix: fix bundle scripts
- e026a45: feat: add project name to cms ui
- e1da510: fix: add exclude support in build and dev commands
- a904e40: fix: fix builds with missing assetUrl
- c1d7940: fix: inject element deps used by other elements
- b2f6ff8: feat: print output file sizes
- b537ce9: fix: apply viteConfig.build from root.config.ts
- b36d4e0: fix: normalize nested arrays
- 7828b62: feat: add useRequestContext hook
- 5a3fd59: fix: use only hash in chunk filenames
- 8a39d33: feat: add better build error logging
- 915029b: feat: add user config for noExternal
- 8b0bafb: fix: update preview server to use project's 404 route
- 1a60d4e: fix: remove renderToString pretty rendering
- 4f14b3c: feat: add plugin system and configureServer hooks
- fd20497: revert: move root error handlers after user plugins
- 2219310: fix: move <Html> to tsx file
- 97d70b9: fix: deference symlinks during builds
- 5169439: fix: fix preact rendering within monorepos
- b3646b7: feat: allow middleware to override public files
- 4f14b3c: feat: add plugins to preview and prod servers
- 98c4af7: fix: use pre-built element graph in prod ssr
- bf9029f: fix: update host addr for dev and prod servers
- 79f8f13: fix: log server errors
- 38b6b6f: fix: various bug fixes
- 93f37a2: fix: add try/catch around vite ssr load
- 4f14b3c: feat: add vitePlugins option for root.js plugins
- 042309b: feat: add root start command
- 2ca60f4: feat: add root-cms init-firebase cli command
- 7b5530a: fix: update typescript typedef for Html component
- 207577d: feat: add publishing mechanism
- 4b0a586: fix: fix handler render type def
- c1dd173: feat: add trailingSlash middleware
- 29ca06c: fix: fix mimeType typo
- 894e2f3: feat: handle custom error pages at routes/404.tsx
- f587c74: feat: add --host flag to server commands
- 6799b64: feat: add client.d.ts to export vite types
- cfa193f: fix: allow custom asset url path formats
- 17b7e51: refactor: switch from t to useTranslations
- 1b6024d: fix: fix non-existant public dir
- 03d468e: refactor: handle monorepo symlink packages
- 2747d11: allow developer to specify rollupOptions
- e8ba905: fix: fix dev server crash on syntax errors
- c0245ca: fix: add css deps from auto-injected elements
- 0735d64: fix: fix deps opt for .tsx files
- 980ad39: fix: avoid duplicating context
- fed22ae: fix: add notification for image upload fail
- 90c5fc6: feat: support extra attrs in Html component
- 08c7b17: fix: fix auto-inject of element islands
- 5369f0e: fix: sanitize filenames with non-ascii chars
- 6c9cf6f: fix: exclude routes files from build output
- 67c9731: fix: fix --mode flag
- 298456f: fix: move root error handlers after user plugins
- 2ef1d63: fix: fix minifyHtml config for build command
- f80b585: fix: fix vite devserver middleware
- e0eb4d1: feat: add custom 404 page used in dev
- 345dbb6: fix esbuild options from root.config.ts
- a36c2c6: feat: add server config to inject middleware
- 3c9043f: fix: add prefix to encode session cookie value
- 33869c5: fix: fix ssr case-sensitive url routes
- 81c367e: feat: add Html component to override lang
- 05a0e06: fix: fix intellisense for Html component
- 5e579b3: chore: update node compatibility version
- 210630d: fix: prefix system injected route params with $
- 3ed4621: fix: fix fallback locales
- 75dffaf: fix: re-generate elements graph when files change
- 6adf9d1: fix: fix multipart file metadata
- e5ec123: feat: add getPreferredLocale() function to ctx
- 03a1f46: feat: add maxRows config to string field
- 6319234: fix: support multiple param names in route-trie
- 8d3c8c2: fix: pass additional options from vite config
- 8064122: fix: fix cms package.json version in create-root
- f1bdaf6: fix: fix routing with query params
- c8a7250: fix: fix dev server errors on startup
- ed1bcf8: fix: handle bad user values from getStaticPaths
- 63d6b6c: fix: move preact deps from peer dependency
- 40d5693: fix: inject locale into route params
- f9e00d2: fix: wrap vite middleware in try/catch
- 6d4b8a7: feat: add minifyHtmlOptions to root.config.ts
- e696c9b: fix: fix linking of preact peer dependency
- f264412: feat: add root build --ssr-only and root preview
- 5c55dc2: fix: use lowercase output file names
- 4f14b3c: feat: inject context vars to dev server requests
- dc4d11e: fix: remove noExternal config from dev
- b9838fd: feat: add exclude regex patterns for elements
- dd0926d: feat: sanitize output files by default

## 1.0.0-beta.64

## 1.0.0-beta.63

## 1.0.0-beta.62

## 1.0.0-beta.61

### Patch Changes

- 33869c5: fix: fix ssr case-sensitive url routes

## 1.0.0-beta.60

### Patch Changes

- 3c9043f: fix: add prefix to encode session cookie value

## 1.0.0-beta.59

### Minor Changes

- 81be985: feat: add session cookie middleware

## 1.0.0-beta.58

## 1.0.0-beta.57

## 1.0.0-beta.56

## 1.0.0-beta.55

### Patch Changes

- 29ca06c: fix: fix mimeType typo

## 1.0.0-beta.54

### Patch Changes

- 6adf9d1: fix: fix multipart file metadata

## 1.0.0-beta.53

### Minor Changes

- 3ae64e3: feat: add multipartMiddlware

## 1.0.0-beta.52

### Patch Changes

- fd20497: revert: move root error handlers after user plugins

## 1.0.0-beta.51

### Patch Changes

- 298456f: fix: move root error handlers after user plugins

## 1.0.0-beta.50

### Patch Changes

- 8b0bafb: fix: update preview server to use project's 404 route
- c1dd173: feat: add trailingSlash middleware

## 1.0.0-beta.49

## 1.0.0-beta.48

### Patch Changes

- 8a39d33: feat: add better build error logging
- 1b6024d: fix: fix non-existant public dir

## 1.0.0-beta.47

### Patch Changes

- b3646b7: feat: allow middleware to override public files

## 1.0.0-beta.46

## 1.0.0-beta.45

## 1.0.0-beta.44

## 1.0.0-beta.43

## 1.0.0-beta.42

## 1.0.0-beta.41

## 1.0.0-beta.40

### Patch Changes

- 3ed4621: fix: fix fallback locales

## 1.0.0-beta.39

## 1.0.0-beta.38

## 1.0.0-beta.37

### Patch Changes

- 6319234: fix: support multiple param names in route-trie

## 1.0.0-beta.36

### Minor Changes

- 8417984: feat: add --concurrency flag to build cmd

## 1.0.0-beta.35

## 1.0.0-beta.34

## 1.0.0-beta.33

## 1.0.0-beta.32

### Patch Changes

- e5ec123: feat: add getPreferredLocale() function to ctx

## 1.0.0-beta.31

### Minor Changes

- fd0bf90: feat: add functions subpackage for GCF
- 06fbcf9: feat: add currentUrl to request context

### Patch Changes

- 5a3fd59: fix: use only hash in chunk filenames
- 4b0a586: fix: fix handler render type def

## 1.0.0-beta.30

### Patch Changes

- 5c55dc2: fix: use lowercase output file names

## 1.0.0-beta.29

## 1.0.0-beta.28

### Patch Changes

- 5369f0e: fix: sanitize filenames with non-ascii chars

## 1.0.0-beta.27

### Patch Changes

- dd0926d: feat: sanitize output files by default

## 1.0.0-beta.26

### Patch Changes

- cfa193f: fix: allow custom asset url path formats

## 1.0.0-beta.25

## 1.0.0-beta.24

### Minor Changes

- ea71e3f: feat: add "save" button
- ea71e3f: feat: add meta image to collection page
- ea71e3f: feat: use gci url as image src

## 1.0.0-beta.23

### Minor Changes

- dc095e3: feat: add custom translations rendering

### Patch Changes

- 75dffaf: fix: re-generate elements graph when files change

## 1.0.0-beta.22

### Minor Changes

- 90465ff: feat: add i18n fallback locales

## 1.0.0-beta.21

### Patch Changes

- 03a1f46: feat: add maxRows config to string field

## 1.0.0-beta.20

### Patch Changes

- 0735d64: fix: fix deps opt for .tsx files

## 1.0.0-beta.19

### Minor Changes

- fe802b3: feat: use dev error pages in preview mode

## 1.0.0-beta.18

### Minor Changes

- d602474: feat: export HTML_CONTEXT to core api

## 1.0.0-beta.17

## 1.0.0-beta.16

### Minor Changes

- 3e3a8f0: feat: add listDocs to root-cms and add example

## 1.0.0-beta.15

## 1.0.0-beta.14

## 1.0.0-beta.13

### Patch Changes

- 980ad39: fix: avoid duplicating context

## 1.0.0-beta.12

### Patch Changes

- 1930fe1: fix: use the same request context in render.js

## 1.0.0-beta.11

### Patch Changes

- 79f8f13: fix: log server errors

## 1.0.0-beta.10

### Patch Changes

- f587c74: feat: add --host flag to server commands

## 1.0.0-beta.9

### Patch Changes

- bf9029f: fix: update host addr for dev and prod servers

## 1.0.0-beta.8

### Patch Changes

- 98c4af7: fix: use pre-built element graph in prod ssr

## 1.0.0-beta.7

## 1.0.0-beta.6

### Patch Changes

- b36d4e0: fix: normalize nested arrays

## 1.0.0-beta.5

### Patch Changes

- 210630d: fix: prefix system injected route params with $

## 1.0.0-beta.4

### Patch Changes

- e026a45: feat: add project name to cms ui
- fed22ae: fix: add notification for image upload fail
- 40d5693: fix: inject locale into route params

## 1.0.0-beta.3

### Patch Changes

- 207577d: feat: add publishing mechanism

## 1.0.0-beta.2

### Patch Changes

- a904e40: fix: fix builds with missing assetUrl

## 1.0.0-beta.1

### Patch Changes

- 2ca60f4: feat: add root-cms init-firebase cli command
- 894e2f3: feat: handle custom error pages at routes/404.tsx
- 6799b64: feat: add client.d.ts to export vite types
- 5e579b3: chore: update node compatibility version
- 8064122: fix: fix cms package.json version in create-root

## 1.0.0-beta.0

### Major Changes

- a5cb6b1: feat: first release of root.js cms

## 1.0.0-alpha.36

### Patch Changes

- 05a0e06: fix: fix intellisense for Html component

## 1.0.0-alpha.35

### Patch Changes

- 90c5fc6: feat: support extra attrs in Html component

## 1.0.0-alpha.34

### Patch Changes

- 97d70b9: fix: deference symlinks during builds

## 1.0.0-alpha.33

### Patch Changes

- b537ce9: fix: apply viteConfig.build from root.config.ts
- 345dbb6: fix esbuild options from root.config.ts

## 1.0.0-alpha.32

### Patch Changes

- dc4d11e: fix: remove noExternal config from dev

## 1.0.0-alpha.31

### Patch Changes

- 915029b: feat: add user config for noExternal
- 2219310: fix: move <Html> to tsx file

## 1.0.0-alpha.30

### Patch Changes

- d6e961c: feat: add prettyHtml option and fix tests
- 7b5530a: fix: update typescript typedef for Html component
- 6d4b8a7: feat: add minifyHtmlOptions to root.config.ts

## 1.0.0-alpha.29

### Patch Changes

- 81c367e: feat: add Html component to override lang

## 1.0.0-alpha.28

### Patch Changes

- 2747d11: allow developer to specify rollupOptions

## 1.0.0-alpha.27

### Patch Changes

- 2ef1d63: fix: fix minifyHtml config for build command

## 1.0.0-alpha.26

### Patch Changes

- 1a60d4e: fix: remove renderToString pretty rendering

## 1.0.0-alpha.25

### Patch Changes

- f1bdaf6: fix: fix routing with query params

## 1.0.0-alpha.24

### Patch Changes

- 93f37a2: fix: add try/catch around vite ssr load

## 1.0.0-alpha.23

### Patch Changes

- b92cf04: fix: add async to vite middleware

## 1.0.0-alpha.22

### Patch Changes

- f9e00d2: fix: wrap vite middleware in try/catch

## 1.0.0-alpha.21

### Patch Changes

- 53b316e: feat: add additional props to request context

## 1.0.0-alpha.20

### Patch Changes

- 7828b62: feat: add useRequestContext hook

## 1.0.0-alpha.19

### Patch Changes

- b2f6ff8: feat: print output file sizes
- 6c9cf6f: fix: exclude routes files from build output

## 1.0.0-alpha.18

### Patch Changes

- 46a35e2: fix: fix bundle scripts

## 1.0.0-alpha.17

### Patch Changes

- c0245ca: fix: add css deps from auto-injected elements

## 1.0.0-alpha.16

### Patch Changes

- 38b6b6f: fix: various bug fixes

## 1.0.0-alpha.15

### Patch Changes

- 03d468e: refactor: handle monorepo symlink packages

## 1.0.0-alpha.14

### Patch Changes

- 8d3c8c2: fix: pass additional options from vite config

## 1.0.0-alpha.13

### Patch Changes

- f80b585: fix: fix vite devserver middleware

## 1.0.0-alpha.12

### Patch Changes

- 4f14b3c: feat: add plugin system and configureServer hooks
- 4f14b3c: feat: add plugins to preview and prod servers
- 4f14b3c: feat: add vitePlugins option for root.js plugins
- 4f14b3c: feat: inject context vars to dev server requests

## 1.0.0-alpha.11

### Patch Changes

- c8a7250: fix: fix dev server errors on startup
- ed1bcf8: fix: handle bad user values from getStaticPaths

## 1.0.0-alpha.10

### Patch Changes

- a36c2c6: feat: add server config to inject middleware

## 1.0.0-alpha.9

### Patch Changes

- 67c9731: fix: fix --mode flag

## 1.0.0-alpha.8

### Patch Changes

- e1da510: fix: add exclude support in build and dev commands
- e0eb4d1: feat: add custom 404 page used in dev
- f264412: feat: add root build --ssr-only and root preview

## 1.0.0-alpha.7

### Patch Changes

- b9838fd: feat: add exclude regex patterns for elements

## 1.0.0-alpha.6

### Patch Changes

- 042309b: feat: add root start command

## 1.0.0-alpha.5

### Patch Changes

- e8ba905: fix: fix dev server crash on syntax errors

## 1.0.0-alpha.4

### Patch Changes

- 1884ecc: feat: add config to include element dirs

## 1.0.0-alpha.3

### Patch Changes

- c1d7940: fix: inject element deps used by other elements
- 17b7e51: refactor: switch from t to useTranslations
- 08c7b17: fix: fix auto-inject of element islands

## 1.0.0-alpha.2

### Patch Changes

- fix: fix preact rendering within monorepos
- 63d6b6c: fix: move preact deps from peer dependency

## 1.0.0-alpha.1

### Patch Changes

- fix: fix linking of preact peer dependency
