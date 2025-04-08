# @blinkk/root

## 1.3.26

## 1.3.25

## 1.3.24

## 1.3.23

### Patch Changes

- f68d307: fix: subtle race condition in createProdServer

## 1.3.22

## 1.3.21

## 1.3.20

### Patch Changes

- efb90a3: fix: fix country code casing

## 1.3.19

### Patch Changes

- dcd8ac7: feat: add country de-facto lang fallbacks

## 1.3.18

### Patch Changes

- e56685c: fix: add quotes around csp nonce

## 1.3.17

### Patch Changes

- e73c1cc: fix: fix csp array push issue

## 1.3.16

### Patch Changes

- 0ad25d9: fix: fix csp pass-by-reference issue

## 1.3.15

### Patch Changes

- 24d25f6: fix: handle unicode url paths in ssr routing

## 1.3.14

### Patch Changes

- 3829c8d: feat: add --app-yaml flag to `root create-package`
- 3b0e340: feat: add `root gae-deploy` cli command
- 6e75e30: fix: remove `workspace:` packages in root create-package

## 1.3.13

### Patch Changes

- 8022259: fix: fix workspace deps when loading root.config.ts
- 8022259: chore: remove devDependencies from prod package.json

## 1.3.13-debug.3

### Patch Changes

- cf9b8c2: chore: add debug statements

## 1.3.13-debug.2

### Patch Changes

- 30adc8c: chore: remove devDependencies from prod package.json

## 1.3.13-debug.1

### Patch Changes

- edada31: chore: update wildcard deps from top-level package

## 1.3.13-debug.0

### Patch Changes

- 84ff15d: fix: fix workspace deps when loading root.config.ts

## 1.3.12

### Patch Changes

- e12001c: fix: fix sitemap ordering

## 1.3.11

## 1.3.10

### Patch Changes

- ec66e26: feat: add plugin handle404 middleware

## 1.3.9

### Patch Changes

- f1293f1: fix: only update session cookie when changed

## 1.3.8

## 1.3.7

## 1.3.6

### Patch Changes

- 43d6f94: fix: update sitemap hreflang format to iso-639
- 1843988: chore: remove trailing nbsp from rich text lines

## 1.3.5

### Patch Changes

- c04e1ac: fix: fix sitemap trailing slash (with tests)

## 1.3.4

### Patch Changes

- eb03a32: fix: fix trailing slashes used in sitemap

## 1.3.3

### Patch Changes

- dd78a18: fix: fix sitemap.xml url path generation

## 1.3.2

## 1.3.1

### Patch Changes

- afef97c: chore: bump root package versions

## 1.2.8

### Patch Changes

- 3c78136: feat: add enableScriptAsync to render script tags async

## 1.2.7

## 1.2.6

## 1.2.5

## 1.2.4

### Patch Changes

- 372bc0e: fix: default session cookies to SameSite=None

## 1.2.3

## 1.2.2

## 1.2.1

## 1.1.3

## 1.1.2

## 1.1.1

## 1.0.10

### Patch Changes

- 4057024: feat: add StringParamsProvider for injecting values to strings
- 376a118: feat: impl sitemap.xml output for ssg builds

## 1.0.9

## 1.0.8

## 1.0.7

### Patch Changes

- 7820665: feat: add preRender hook to plugins
- 9d4c662: feat: add codegen cli

## 1.0.6

### Patch Changes

- b3411f2: fix: only include "start" script in release package
- 41a3e50: fix: fix 404 routes with base path

## 1.0.5

## 1.0.4

### Patch Changes

- 4648ec3: feat: add hideLabel to schema fields (#312)
- e05026c: fix: fix sourcemaps in render-time errors

## 1.0.3

### Patch Changes

- 2c66a10: fix: ignore watcher for non-dev server

## 1.0.2

### Patch Changes

- 8496db8: fix: add missing css output to build
- 9434215: feat: auto generate .d.ts types when .schema.ts files change

## 1.0.1

### Patch Changes

- debd50b: chore: bump version

## 1.0.0

### Major Changes

- 31723f2: feat: initial release of root.js web
- a5cb6b1: feat: first release of root.js cms

### Minor Changes

- 6a77ba6: feat: add `basePath` config
- dc095e3: feat: add custom translations rendering
- 4ce147d: feat: add `server.headers` config to root.config.ts
- 3e3a8f0: feat: add listDocs to root-cms and add example
- 90465ff: feat: add i18n fallback locales
- fd0bf90: feat: add functions subpackage for GCF
- 2455c96: build: upgrade to vite5 and update deps
- cf20297: feat: add root create-package cli command
- 8417984: feat: add --concurrency flag to build cmd
- 27520ed: feat: add es-419 to intl fallbacks
- ea71e3f: feat: add "save" button
- 66d7e76: feat: add richtext schema field
- 63d8af3: feat: add server csp config options
- 3ae64e3: feat: add multipartMiddlware
- 81be985: feat: add session cookie middleware
- fe802b3: feat: use dev error pages in preview mode
- 2fa06c3: feat: support nextjs-style [[...optcatchall]] routes
- ea71e3f: feat: add meta image to collection page
- d602474: feat: export HTML_CONTEXT to core api
- 06fbcf9: feat: add currentUrl to request context
- ea71e3f: feat: use gci url as image src

### Patch Changes

- 1884ecc: feat: add config to include element dirs
- 53b316e: feat: add additional props to request context
- b92cf04: fix: add async to vite middleware
- 95e98a6: fix: fix externalize-deps
- d6e961c: feat: add prettyHtml option and fix tests
- 6091bb6: fix: update useTranslations to work in a rehydrated context
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
- c9bf955: feat: update public dir cache when files change
- 915029b: feat: add user config for noExternal
- ddcbe58: fix: fix ?inline css deps injected in dev
- 556082f: chore: pin deps to exact versions
- a8f4d6d: chore: pin js-beautify version
- 8b0bafb: fix: update preview server to use project's 404 route
- 1a60d4e: fix: remove renderToString pretty rendering
- 4f14b3c: feat: add plugin system and configureServer hooks
- fd20497: revert: move root error handlers after user plugins
- 006df38: fix: fix vite warnings for ssr-built files
- 2219310: fix: move <Html> to tsx file
- 97d70b9: fix: deference symlinks during builds
- 5169439: fix: fix preact rendering within monorepos
- b3646b7: feat: allow middleware to override public files
- 2709009: fix: convert /index/index.html paths to /index.html
- 4f14b3c: feat: add plugins to preview and prod servers
- 98c4af7: fix: use pre-built element graph in prod ssr
- bf9029f: fix: update host addr for dev and prod servers
- 79f8f13: fix: log server errors
- 38b6b6f: fix: various bug fixes
- 8476fb3: fix: fix preview server error messages
- 93f37a2: fix: add try/catch around vite ssr load
- 4f14b3c: feat: add vitePlugins option for root.js plugins
- f3e63b3: chore: update csp default values
- 042309b: feat: add root start command
- 2ca60f4: feat: add root-cms init-firebase cli command
- b0df82e: fix: fix deps
- 7b5530a: fix: update typescript typedef for Html component
- 207577d: feat: add publishing mechanism
- 7f80435: feat: pre-bundle root.config.ts in root build
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
- b6363a2: fix: fix preserveFilename option with file field
- 08c7b17: fix: fix auto-inject of element islands
- 5369f0e: fix: sanitize filenames with non-ascii chars
- 8d0191a: fix: give higher precedence to es-419 lang code
- 6c9cf6f: fix: exclude routes files from build output
- 67c9731: fix: fix --mode flag
- 298456f: fix: move root error handlers after user plugins
- 28e8e64: chore: upgrade deps
- 2ef1d63: fix: fix minifyHtml config for build command
- f80b585: fix: fix vite devserver middleware
- d05691c: fix: fix build for ssr-only routes
- 2d8800f: fix: avoid externalizing packages starting with "@"
- e0eb4d1: feat: add custom 404 page used in dev
- 345dbb6: fix esbuild options from root.config.ts
- a36c2c6: feat: add server config to inject middleware
- 3c9043f: fix: add prefix to encode session cookie value
- 33869c5: fix: fix ssr case-sensitive url routes
- 81c367e: feat: add Html component to override lang
- 05a0e06: fix: fix intellisense for Html component
- 5e579b3: chore: update node compatibility version
- 210630d: fix: prefix system injected route params with $
- 7cbc507: fix: revert route case sensitivity
- da95b72: fix: fix trailing slash middleware
- 3ed4621: fix: fix fallback locales
- 3941e85: chore: switch to [hash] only for assets/chunks
- 75dffaf: fix: re-generate elements graph when files change
- 6adf9d1: fix: fix multipart file metadata
- e5ec123: feat: add getPreferredLocale() function to ctx
- 9f1803b: feat: add redirects middleware
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
- e4eded3: fix: fix duplicate files copied in build
- 40383ef: fix: fix vite5 decorator transformations
- e696c9b: fix: fix linking of preact peer dependency
- f264412: feat: add root build --ssr-only and root preview
- 1aab112: fix: externalize deps in package.json
- 5c55dc2: fix: use lowercase output file names
- 4f14b3c: feat: inject context vars to dev server requests
- 8010ef8: chore: add inline sourcemap to render.js output
- dc4d11e: fix: remove noExternal config from dev
- 1f3ab3c: feat: pass rootConfig as context to getStaticPaths
- b9838fd: feat: add exclude regex patterns for elements
- dd0926d: feat: sanitize output files by default
- dad8ddc: fix: fix debounce handling of public dir changes

## 1.0.0-rc.43

### Patch Changes

- 3941e85: chore: switch to [hash] only for assets/chunks
- 1aab112: fix: externalize deps in package.json

## 1.0.0-rc.42

### Patch Changes

- 95e98a6: fix: fix externalize-deps

## 1.0.0-rc.41

### Patch Changes

- 2d8800f: fix: avoid externalizing packages starting with "@"
- 8010ef8: chore: add inline sourcemap to render.js output

## 1.0.0-rc.40

### Patch Changes

- 8d0191a: fix: give higher precedence to es-419 lang code

## 1.0.0-rc.39

### Minor Changes

- cf20297: feat: add root create-package cli command

### Patch Changes

- 6091bb6: fix: update useTranslations to work in a rehydrated context

## 1.0.0-rc.38

## 1.0.0-rc.37

### Patch Changes

- f3e63b3: chore: update csp default values

## 1.0.0-rc.36

### Minor Changes

- 63d8af3: feat: add server csp config options

## 1.0.0-rc.35

### Patch Changes

- da95b72: fix: fix trailing slash middleware

## 1.0.0-rc.34

### Minor Changes

- 4ce147d: feat: add `server.headers` config to root.config.ts

## 1.0.0-rc.33

## 1.0.0-rc.32

## 1.0.0-rc.31

## 1.0.0-rc.30

## 1.0.0-rc.29

### Patch Changes

- 2709009: fix: convert /index/index.html paths to /index.html

## 1.0.0-rc.28

### Patch Changes

- 556082f: chore: pin deps to exact versions

## 1.0.0-rc.27

## 1.0.0-rc.26

### Patch Changes

- a8f4d6d: chore: pin js-beautify version

## 1.0.0-rc.25

## 1.0.0-rc.24

### Patch Changes

- b6363a2: fix: fix preserveFilename option with file field

## 1.0.0-rc.23

## 1.0.0-rc.22

### Patch Changes

- dad8ddc: fix: fix debounce handling of public dir changes

## 1.0.0-rc.21

### Patch Changes

- c9bf955: feat: update public dir cache when files change

## 1.0.0-rc.20

## 1.0.0-rc.19

## 1.0.0-rc.18

## 1.0.0-rc.17

### Patch Changes

- 40383ef: fix: fix vite5 decorator transformations

## 1.0.0-rc.16

### Patch Changes

- 7f80435: feat: pre-bundle root.config.ts in root build
- 9f1803b: feat: add redirects middleware

## 1.0.0-rc.15

## 1.0.0-rc.14

### Patch Changes

- e4eded3: fix: fix duplicate files copied in build

## 1.0.0-rc.13

## 1.0.0-rc.12

### Minor Changes

- 2455c96: build: upgrade to vite5 and update deps

### Patch Changes

- 1f3ab3c: feat: pass rootConfig as context to getStaticPaths

## 1.0.0-rc.11

### Patch Changes

- 7cbc507: fix: revert route case sensitivity

## 1.0.0-rc.10

### Minor Changes

- 66d7e76: feat: add richtext schema field

## 1.0.0-rc.9

### Minor Changes

- 6a77ba6: feat: add `basePath` config

## 1.0.0-rc.8

### Minor Changes

- 27520ed: feat: add es-419 to intl fallbacks

### Patch Changes

- 8476fb3: fix: fix preview server error messages

## 1.0.0-rc.7

## 1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- ddcbe58: fix: fix ?inline css deps injected in dev

## 1.0.0-rc.4

## 1.0.0-rc.3

## 1.0.0-rc.2

### Minor Changes

- 2fa06c3: feat: support nextjs-style [[...optcatchall]] routes

### Patch Changes

- 006df38: fix: fix vite warnings for ssr-built files
- b0df82e: fix: fix deps
- d05691c: fix: fix build for ssr-only routes

## 1.0.0-rc.1

### Patch Changes

- 28e8e64: chore: upgrade deps

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
