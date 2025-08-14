# @blinkk/root-cms

## 2.0.4

### Patch Changes

- 5a7c257: fix: preserve alt text when replacing a file
- 176482e: fix: handle stalled gcs uploads
- 8bece22: fix: fix image non-empty state on load
- fbee89d: fix: enable dropping over the file upload button
- Updated dependencies [f137e61]
  - @blinkk/root@2.0.4

## 2.0.3

### Patch Changes

- 898cd14: chore: small style updates to file field
- 479316a: feat: add json diff viewer inside the ai editor
  - @blinkk/root@2.0.3

## 2.0.2

### Patch Changes

- aa567c9: fix: default localization modal to non-EN locale
- fef188b: feat: add "edit with ai" modal
- 3b5a0e7: feat: add experiment for enabling lexical editor
  - @blinkk/root@2.0.2

## 2.0.1

### Patch Changes

- 7532310: fix: remove race condition with alt text changes
  - @blinkk/root@2.0.1

## 2.0.0

### Minor Changes

- 6cb8708: feat: allow configuring custom CMS favicon

### Patch Changes

- d040a4b: fix: array header sizing
- d040a4b: fix: array header preview sizing
- 67ade33: fix: save file/image drafts immediately on change"
- 690c057: refactor: use new file upload field
- 0cd68df: fix: upgrade genkit to fix ai features
  - @blinkk/root@2.0.0

## 1.4.14

### Patch Changes

- 0aead2a: feat: make array headers sticky when scrolling
- 63f923e: feat: add Z-A sort option
- 1f5a4e9: feat: add support for schema-level previews (and images)
- 5e5f615: feat: add drag and drop for arrays
- 0af870f: fix: polish deeplink behavior
- 3decc30: feat: add expand/collapse for cms preview
  - @blinkk/root@1.4.14

## 1.4.13

### Patch Changes

- eb41e5c: feat: add date field to doc editor
- Updated dependencies [7c0ccde]
- Updated dependencies [1860e81]
- Updated dependencies [714357b]
  - @blinkk/root@1.4.13

## 1.4.12

### Patch Changes

- a9e7564: fix: fix virtual clipboard
- 236b1df: feat: tag version when publishing docs
- 0f6b9c5: feat: add data source publishing to releases
  - @blinkk/root@1.4.12

## 1.4.11

### Patch Changes

- 07038b1: revert: improve local hmr experience
  - @blinkk/root@1.4.11

## 1.4.10

### Patch Changes

- 8704000: feat: improve local hmr experience
- 70fea5d: chore: increase default cache-control max-age
- Updated dependencies [8704000]
  - @blinkk/root@1.4.10

## 1.4.9

### Patch Changes

- 7d95baf: chore: suppress deprecated fields that are empty
  - @blinkk/root@1.4.9

## 1.4.8

### Patch Changes

- 9b2f49a: feat: add option to disable alt text (#579)
- 0c05ca6: feat: add v2 BatchRequest to v1 branch (#577)
- Updated dependencies [2b66318]
  - @blinkk/root@1.4.8

## 1.4.7

### Patch Changes

- 4f8c519: fix: preserve column headers in data sources (#574)
  - @blinkk/root@1.4.7

## 1.4.6

### Patch Changes

- 62dfdb0: feat: open reference field preview cards in new tab
- Updated dependencies [01d33c6]
  - @blinkk/root@1.4.6

## 1.4.5

### Patch Changes

- 66886f4: feat: add TranslationsManager from `v2` branch (#541)
- 51c7269: feat: add slugRegex config option for collections (#538)
- 4d1caab: fix: resize sheet request
- 808857b: feat: add autolock on edit (#540)
- Updated dependencies [c877834]
- Updated dependencies [501ab72]
  - @blinkk/root@1.4.5

## 1.4.4

### Patch Changes

- c777571: fix: fix race condition in richtext editor (#529)
- a9cb97d: fix: preserve tags when saving translations (#526)
- d95163c: fix: fix richtext editor destroy error (#528)
  - @blinkk/root@1.4.4

## 1.4.3

### Patch Changes

- c7c2a2c: feat: add NumberField
  - @blinkk/root@1.4.3

## 1.4.2

### Patch Changes

- b932dbc: fix: fix new doc creation
- b8fb390: fix: add id to serialized collection data #514
  - @blinkk/root@1.4.2

## 1.4.1

### Patch Changes

- 4949ba4: refactor: de-dupe schema.define() types in root-cms.d.ts #504
- 7525e3d: refactor: remove schema fields from ROOT_CTX #509
- 20629af: feat: add alt text to video files
- 04e9b83: fix: restrict scheduling to the future

  - this wasn't working previously
  - tidy up use of datetime-local across cms views

- 9d2bdaa: chore: manually bump versions to 1.4.0
- Updated dependencies [5a0248c]
- Updated dependencies [9d2bdaa]
  - @blinkk/root@1.4.1

## 1.3.27

### Patch Changes

- 72aabac: fix: improve arb download feature
  - @blinkk/root@1.3.27

## 1.3.26

### Patch Changes

- 04d78b7: chore: update editorjs deps
- 19b6032: fix: disallow scheduling in the past
  - @blinkk/root@1.3.26

## 1.3.25

### Patch Changes

- e6de711: feat: add gif support
  - @blinkk/root@1.3.25

## 1.3.24

### Patch Changes

- 0ef8abc: fix: remove sourcemap from cms static files
  - @blinkk/root@1.3.24

## 1.3.23

### Patch Changes

- Updated dependencies [f68d307]
  - @blinkk/root@1.3.23

## 1.3.22

### Patch Changes

- 5563d26: fix: update handling of oneOf type defs
  - @blinkk/root@1.3.22

## 1.3.21

### Patch Changes

- ede0a94: fix: output correct types for oneOf field
- c8d8450: feat: add hotkey support to array items in doc editor
- ed1e402: feat: add preliminary virtual clipboard
- 9eec99e: feat: allow array copy/paste between content docs
  - @blinkk/root@1.3.21

## 1.3.20

### Patch Changes

- Updated dependencies [efb90a3]
  - @blinkk/root@1.3.20

## 1.3.19

### Patch Changes

- Updated dependencies [dcd8ac7]
  - @blinkk/root@1.3.19

## 1.3.18

### Patch Changes

- Updated dependencies [e56685c]
  - @blinkk/root@1.3.18

## 1.3.17

### Patch Changes

- Updated dependencies [e73c1cc]
  - @blinkk/root@1.3.17

## 1.3.16

### Patch Changes

- Updated dependencies [0ad25d9]
  - @blinkk/root@1.3.16

## 1.3.15

### Patch Changes

- Updated dependencies [24d25f6]
  - @blinkk/root@1.3.15

## 1.3.14

### Patch Changes

- Updated dependencies [3829c8d]
- Updated dependencies [3b0e340]
- Updated dependencies [6e75e30]
  - @blinkk/root@1.3.14

## 1.3.13

### Patch Changes

- Updated dependencies [8022259]
- Updated dependencies [8022259]
  - @blinkk/root@1.3.13

## 1.3.13-debug.3

### Patch Changes

- Updated dependencies [cf9b8c2]
  - @blinkk/root@1.3.13-debug.3

## 1.3.13-debug.2

### Patch Changes

- Updated dependencies [30adc8c]
  - @blinkk/root@1.3.13-debug.2

## 1.3.13-debug.1

### Patch Changes

- Updated dependencies [edada31]
  - @blinkk/root@1.3.13-debug.1

## 1.3.13-debug.0

### Patch Changes

- Updated dependencies [84ff15d]
  - @blinkk/root@1.3.13-debug.0

## 1.3.12

### Patch Changes

- e217aea: feat: add option for listing raw docs
- Updated dependencies [e12001c]
  - @blinkk/root@1.3.12

## 1.3.11

### Patch Changes

- 9fe5fb9: feat: add "watch" option to cms config
  - @blinkk/root@1.3.11

## 1.3.10

### Patch Changes

- Updated dependencies [ec66e26]
  - @blinkk/root@1.3.10

## 1.3.9

### Patch Changes

- 2b27a86: fix: fix reference field when doc is deleted
- Updated dependencies [f1293f1]
  - @blinkk/root@1.3.9

## 1.3.8

### Patch Changes

- 494fef6: fix: fix sys overwrite when copying files
  - @blinkk/root@1.3.8

## 1.3.7

### Patch Changes

- e56a367: fix: preserve sys when copying a doc
  - @blinkk/root@1.3.7

## 1.3.6

### Patch Changes

- 1843988: chore: remove trailing nbsp from rich text lines
- Updated dependencies [43d6f94]
- Updated dependencies [1843988]
  - @blinkk/root@1.3.6

## 1.3.5

### Patch Changes

- Updated dependencies [c04e1ac]
  - @blinkk/root@1.3.5

## 1.3.4

### Patch Changes

- Updated dependencies [eb03a32]
  - @blinkk/root@1.3.4

## 1.3.3

### Patch Changes

- ec00ba1: build: minify root cms static files
- Updated dependencies [dd78a18]
  - @blinkk/root@1.3.3

## 1.3.2

### Patch Changes

- 750bfce: fix: remove query params from url path check
  - @blinkk/root@1.3.2

## 1.3.1

### Patch Changes

- a5a6ae6: fix: prevent unauthorized users from accessing cms ui
- c29d741: fix: avoid marshalling rich text data
- afef97c: chore: bump root package versions
- Updated dependencies [afef97c]
  - @blinkk/root@1.3.1

## 1.2.8

### Patch Changes

- 955e35b: fix: avoid excessive logging, add logLevel config
- Updated dependencies [3c78136]
  - @blinkk/root@1.2.8

## 1.2.7

### Patch Changes

- 344e5a0: fix: normalize iframe preview urls
  - @blinkk/root@1.2.7

## 1.2.6

### Patch Changes

- df9bcdf: feat: add video width/height to uploaded files
- ab483bb: feat: add saveDraftData() to cms client
- 1fd83dd: fix: fix doc deletes
  - @blinkk/root@1.2.6

## 1.2.5

### Patch Changes

- 840fb57: feat: use country display name for `ALL_xx` locales
- a86624c: feat: disable sharebox for non-admin users
  - @blinkk/root@1.2.5

## 1.2.4

### Patch Changes

- Updated dependencies [372bc0e]
  - @blinkk/root@1.2.4

## 1.2.3

### Patch Changes

- cbd5c63: feat: add ai chat context awareness
- 4ec274e: feat: add getUserRole() to cms client
- cbd5c63: feat: root ai chat history
- 4c9a20f: feat: add allowedIframeOrigins to cms plugin options
  - @blinkk/root@1.2.3

## 1.2.2

### Patch Changes

- aa93beb: feat: add show translations icon to translateable fields
- ae179f0: feat: add per-doc translations editor
  - @blinkk/root@1.2.2

## 1.2.1

### Patch Changes

- c4db613: feat: add experimental ai framework (#357)
  - @blinkk/root@1.2.1

## 1.1.3

### Patch Changes

- 7544d93: fix: update drawer to details based component
- d5ad5ce: feat: add status badge for locked docs
- 39d3d57: feat: add cms field deeplinking
  - @blinkk/root@1.1.3

## 1.1.2

### Patch Changes

- f4099cf: feat: add "inline" option to object drawers
- defb389: chore: group sequential doc.save actions
  - @blinkk/root@1.1.2

## 1.1.1

### Patch Changes

- c94ad71: fix: remove non-alphanumeric chars from type gen
- 2cfea11: feat: add publishing lock
- 82a6373: feat: add "drawer" variant to object field
- d129560: feat: add diff viewer to publishing flow
- 4d2064a: feat: add "domain" to collection config
  - @blinkk/root@1.1.1

## 1.0.10

### Patch Changes

- Updated dependencies [4057024]
- Updated dependencies [376a118]
  - @blinkk/root@1.0.10

## 1.0.9

### Patch Changes

- c207662: fix: fix new translations uploads
  - @blinkk/root@1.0.9

## 1.0.8

### Patch Changes

- 7b10a32: feat: add action logs
  - @blinkk/root@1.0.8

## 1.0.7

### Patch Changes

- 0f1de84: feat: add "edit json" on full doc
- Updated dependencies [7820665]
- Updated dependencies [9d4c662]
  - @blinkk/root@1.0.7

## 1.0.6

### Patch Changes

- 9515de6: feat: add support for non-default firestore databases
- 53c3d41: fix: fix preview button on data sources page
- d779e87: feat: add custom cms sidebar tools (#326)
- c76e578: feat: add option to overwrite when copying doc (#327)
- Updated dependencies [b3411f2]
- Updated dependencies [41a3e50]
  - @blinkk/root@1.0.6

## 1.0.5

### Patch Changes

- 04abf4f: feat: add "preview" button to data sources
- 7f17523: feat: add cacheControl options to file and image fields
- 6aa2fc4: feat: add index0 and index1 placeholders to array fields
  - @blinkk/root@1.0.5

## 1.0.4

### Patch Changes

- Updated dependencies [4648ec3]
- Updated dependencies [e05026c]
  - @blinkk/root@1.0.4

## 1.0.3

### Patch Changes

- Updated dependencies [2c66a10]
  - @blinkk/root@1.0.3

## 1.0.2

### Patch Changes

- 9434215: feat: auto generate .d.ts types when .schema.ts files change
- Updated dependencies [8496db8]
- Updated dependencies [9434215]
  - @blinkk/root@1.0.2

## 1.0.1

### Patch Changes

- debd50b: chore: bump version
- Updated dependencies [debd50b]
  - @blinkk/root@1.0.1

## 1.0.0

### Major Changes

- a5cb6b1: feat: first release of root.js cms

### Minor Changes

- 6119500: feat: auto reload iframe when db is saved
- f083fd9: feat: update cache-control for gcs uploads to 1yr
- e492dea: feat: add drag/drop to file field
- c39c39e: feat: update security rules so only admins can edit project settings
- 12f69ee: feat: automatically share gsheets with editors
- c67881c: feat: basic arb download ui
- 0523622: feat: use signed cookies for auth
- 34f7cdc: feat: add file upload field
- 8125496: feat: add buttonLabel config to array fields
- ff17522: feat: add icon to remove image
- 2145120: feat: add edit translations page
- 159f8b2: feat: add releases page
- 3e3a8f0: feat: add listDocs to root-cms and add example
- 35310eb: feat: add import csv translations
- da0e4ef: feat: add copy doc action menu
- 8549176: feat: add options for linking to existing google sheets
- b40576d: feat: display avatars viewing current doc
- afb0c01: feat: add RootCMSClient class
- ad27525: feat: add richtext component
- 1f06f4e: feat: add revert draft action
- ae7c4f3: feat: add gcs file uploader button
- 2455c96: build: upgrade to vite5 and update deps
- fff594b: feat: add orderByDirection to listDocs()
- c31304b: feat: save changes before preview reloads
- c39c39e: feat: add support for wildcard domain ACLS, e.g. `*@example.com`
- c39c39e: chore: validate ACL membership for every authenticated request
- f843250: feat: add version history cron job
- b01b3b4: feat: add ui for listing and restoring versions
- 8a21902: feat: add numDocs() method for getting collection count
- dc095e3: feat: add localization config modal
- 48153bc: feat: add publishDocs() to cms client
- c49b76c: feat: add preserveFilename option to file schema
- 356b357: feat: add data sources
- df4fc27: feat: update security rules so only ADMIN can change project settings
- 1783ab7: feat: import strings to Translations collection
- 9afd451: feat: add svg to accept image types
- 523cd85: feat: add timezone info to datetime field
- ab2f82d: feat: add scheduled publishing
- 20fadd1: feat: add underline and strikethrough to rich text editor
- 66d7e76: feat: add richtext schema field
- 3b1a6e8: feat: google sheets localization
- 3517454: feat: add image drag/drop
- 5fe279c: feat: add edit data source page
- 3ae64e3: feat: add multipartMiddlware
- 81be985: feat: add session cookie middleware
- 0a69a62: feat: add default value caching for object fields
- b0fed8a: feat: add reference field
- 7061ff6: feat: add http data sources
- 1f68372: feat: add DateTime field
- 93c49d7: feat: add saveTranslations method to cms client

### Patch Changes

- e6334a5: feat: add query() option to numDocs()
- 2366529: chore: preserve device state when navigating
- 8b56993: fix: remove vite dep from cms client
- 4365554: feat: add defaultImage to schema previews
- e026a45: feat: add project name to cms ui
- 4071fd1: feat: add basic image uploads and gci serving url
- b212258: fix: fix root-cms dist
- 83c9caf: fix: fix preview path
- de1f494: feat: add type def for date field
- 72491bb: fix: fix l10n modal locales checkbox
- 19e7bf2: fix: increase multer file size limit
- b36d4e0: fix: normalize nested arrays
- 70a1633: fix: use bundled config for gcf cron jobs
- 1ad4139: fix: update type gen for image and datetime
- ee240c9: build: fix root-cms packaging
- fb23c6a: feat: update root cms logo
- 556082f: chore: pin deps to exact versions
- 08d7cf4: fix: use singleton firebase app instance
- b9b8968: feat: add image alt text field
- 6347c59: build: remove richtext subpackage from root-cms
- 36d3ced: feat: add option for configuring gci
- ba53753: fix: add "en" as default locale
- 5975bf0: fix: fix split panel resizer
- 63cb83f: fix: fix collection page overflow
- a79aebc: fix: set cookie to secure=false on dev
- 4067634: fix: add experimental fix for large collections
- b0b8a3c: fix: minimal signin ui
- 46f2f59: fix: update session cookie name to match firebase
- 7f8d62f: fix: fix overflow issue
- 6e4332e: chore: better error messages for login failures
- 4960432: feat: allow docs with non-EN locale
- 9ad44fe: fix: fix initialization of richtext data
- fbadf96: feat: add collection list to home page
- cf34e66: feat: add custom queries for listing docs
- ae16f58: fix: fix reload of iframe url
- 883735f: fix: re-indent 4-space generated types to 2
- c4613da: fix: extract all locales to csv
- 2ca60f4: feat: add root-cms init-firebase cli command
- b0df82e: fix: fix deps
- 26f7846: feat: pass query params from cms to preview url
- cb99a12: fix: fix string normalization
- 073cdaa: chore: select a collection by default
- 243afcc: fix: sort translations by source string
- 38902f2: fix: add error message for login failures
- fed22ae: fix: add notification for image upload fail
- aa9cab4: fix: use memory storage for multer
- a6fddb8: chore: update ACL check until full-domain ACLs are supported
- ef5a450: fix: fix content overflow
- 729b313: feat: add locale toggle to preview window
- 9f85f7c: fix: rename header to root cms
- 4baddc5: re-load doc card when reference changes
- 28e8e64: chore: upgrade deps
- 596fd46: build: fix root-cms ci build
- 463f398: feat: add edit json modal
- d79782d: feat: start/stop db snapshots on visibility
- a36c2c6: feat: add server config to inject middleware
- f93eefa: fix: fix user sessions
- f475f90: feat: add `--admin=<email>` flag to `init-firebase` cli
- 0be0a8c: fix: disable auth check for cron jobs
- 5e579b3: chore: update node compatibility version
- 480d890: chore: update viewer disconnect logic and styles
- 2997a1a: fix: filter docs by scheduledAt time
- d5b28cb: feat: add unpublish doc action
- d8a207d: chore: add favicon to root cms
- 14e2ba1: fix: ignore schema dts from functions dir
- 8064122: fix: fix cms package.json version in create-root
- 0b1ae54: fix: add app name to firebase getApp
- 193269e: feat: add root-cms package and schema definitions
- 67cc4fc: refactor: move richtext into core folder
- 547ef5e: fix: fix sanitizer for underline and strikethrough
- 15ae86f: fix: fix jwt token exp check
- 854c67f: fix: preserve image "alt" text
- 30f8f37: feat: add img dimens to preview box
- 85c87d4: fix: update labels for discarding draft edits
- 4f14b3c: feat: inject context vars to dev server requests
- 2a7f2bf: fix: fix richtext reload issue
- 60c4bc1: fix: fix firstPublished for scheduled docs
- 5c55dc2: fix: set SameSite cookie attr
- c3b3f08: fix: fix localizedUrl for newTab button
- 34f1200: fix: fix login redirects
- 8eeeea3: feat: add boolean field to cms ui
- Updated dependencies [1884ecc]
- Updated dependencies [53b316e]
- Updated dependencies [b92cf04]
- Updated dependencies [95e98a6]
- Updated dependencies [d6e961c]
- Updated dependencies [6091bb6]
- Updated dependencies [46a35e2]
- Updated dependencies [e026a45]
- Updated dependencies [e1da510]
- Updated dependencies [6a77ba6]
- Updated dependencies [a904e40]
- Updated dependencies [c1d7940]
- Updated dependencies [dc095e3]
- Updated dependencies [b2f6ff8]
- Updated dependencies [b537ce9]
- Updated dependencies [b36d4e0]
- Updated dependencies [7828b62]
- Updated dependencies [5a3fd59]
- Updated dependencies [8a39d33]
- Updated dependencies [31723f2]
- Updated dependencies [c9bf955]
- Updated dependencies [915029b]
- Updated dependencies [4ce147d]
- Updated dependencies [ddcbe58]
- Updated dependencies [556082f]
- Updated dependencies [a8f4d6d]
- Updated dependencies [8b0bafb]
- Updated dependencies [1a60d4e]
- Updated dependencies [4f14b3c]
- Updated dependencies [fd20497]
- Updated dependencies [006df38]
- Updated dependencies [2219310]
- Updated dependencies [97d70b9]
- Updated dependencies [5169439]
- Updated dependencies [3e3a8f0]
- Updated dependencies [b3646b7]
- Updated dependencies [2709009]
- Updated dependencies [4f14b3c]
- Updated dependencies [98c4af7]
- Updated dependencies [bf9029f]
- Updated dependencies [79f8f13]
- Updated dependencies [38b6b6f]
- Updated dependencies [8476fb3]
- Updated dependencies [a5cb6b1]
- Updated dependencies [93f37a2]
- Updated dependencies [4f14b3c]
- Updated dependencies [f3e63b3]
- Updated dependencies [90465ff]
- Updated dependencies [042309b]
- Updated dependencies [2ca60f4]
- Updated dependencies [b0df82e]
- Updated dependencies [7b5530a]
- Updated dependencies [207577d]
- Updated dependencies [7f80435]
- Updated dependencies [4b0a586]
- Updated dependencies [c1dd173]
- Updated dependencies [29ca06c]
- Updated dependencies [894e2f3]
- Updated dependencies [f587c74]
- Updated dependencies [6799b64]
- Updated dependencies [fd0bf90]
- Updated dependencies [cfa193f]
- Updated dependencies [17b7e51]
- Updated dependencies [1b6024d]
- Updated dependencies [03d468e]
- Updated dependencies [2747d11]
- Updated dependencies [e8ba905]
- Updated dependencies [2455c96]
- Updated dependencies [c0245ca]
- Updated dependencies [0735d64]
- Updated dependencies [980ad39]
- Updated dependencies [fed22ae]
- Updated dependencies [90c5fc6]
- Updated dependencies [b6363a2]
- Updated dependencies [08c7b17]
- Updated dependencies [5369f0e]
- Updated dependencies [8d0191a]
- Updated dependencies [6c9cf6f]
- Updated dependencies [67c9731]
- Updated dependencies [298456f]
- Updated dependencies [28e8e64]
- Updated dependencies [2ef1d63]
- Updated dependencies [f80b585]
- Updated dependencies [d05691c]
- Updated dependencies [2d8800f]
- Updated dependencies [e0eb4d1]
- Updated dependencies [345dbb6]
- Updated dependencies [a36c2c6]
- Updated dependencies [3c9043f]
- Updated dependencies [cf20297]
- Updated dependencies [33869c5]
- Updated dependencies [81c367e]
- Updated dependencies [8417984]
- Updated dependencies [05a0e06]
- Updated dependencies [27520ed]
- Updated dependencies [5e579b3]
- Updated dependencies [210630d]
- Updated dependencies [7cbc507]
- Updated dependencies [da95b72]
- Updated dependencies [ea71e3f]
- Updated dependencies [3ed4621]
- Updated dependencies [3941e85]
- Updated dependencies [75dffaf]
- Updated dependencies [6adf9d1]
- Updated dependencies [e5ec123]
- Updated dependencies [9f1803b]
- Updated dependencies [03a1f46]
- Updated dependencies [6319234]
- Updated dependencies [8d3c8c2]
- Updated dependencies [66d7e76]
- Updated dependencies [8064122]
- Updated dependencies [f1bdaf6]
- Updated dependencies [c8a7250]
- Updated dependencies [ed1bcf8]
- Updated dependencies [63d6b6c]
- Updated dependencies [40d5693]
- Updated dependencies [63d8af3]
- Updated dependencies [f9e00d2]
- Updated dependencies [3ae64e3]
- Updated dependencies [6d4b8a7]
- Updated dependencies [81be985]
- Updated dependencies [e4eded3]
- Updated dependencies [40383ef]
- Updated dependencies [fe802b3]
- Updated dependencies [e696c9b]
- Updated dependencies [2fa06c3]
- Updated dependencies [ea71e3f]
- Updated dependencies [f264412]
- Updated dependencies [1aab112]
- Updated dependencies [5c55dc2]
- Updated dependencies [4f14b3c]
- Updated dependencies [8010ef8]
- Updated dependencies [dc4d11e]
- Updated dependencies [d602474]
- Updated dependencies [1f3ab3c]
- Updated dependencies [06fbcf9]
- Updated dependencies [b9838fd]
- Updated dependencies [dd0926d]
- Updated dependencies [dad8ddc]
- Updated dependencies [ea71e3f]
  - @blinkk/root@1.0.0

## 1.0.0-rc.43

### Patch Changes

- Updated dependencies [3941e85]
- Updated dependencies [1aab112]
  - @blinkk/root@1.0.0-rc.43

## 1.0.0-rc.42

### Patch Changes

- Updated dependencies [95e98a6]
  - @blinkk/root@1.0.0-rc.42

## 1.0.0-rc.41

### Patch Changes

- 2a7f2bf: fix: fix richtext reload issue
- Updated dependencies [2d8800f]
- Updated dependencies [8010ef8]
  - @blinkk/root@1.0.0-rc.41

## 1.0.0-rc.40

### Minor Changes

- 12f69ee: feat: automatically share gsheets with editors

### Patch Changes

- Updated dependencies [8d0191a]
  - @blinkk/root@1.0.0-rc.40

## 1.0.0-rc.39

### Patch Changes

- f475f90: feat: add `--admin=<email>` flag to `init-firebase` cli
- 480d890: chore: update viewer disconnect logic and styles
- Updated dependencies [6091bb6]
- Updated dependencies [cf20297]
  - @blinkk/root@1.0.0-rc.39

## 1.0.0-rc.38

### Patch Changes

- 70a1633: fix: use bundled config for gcf cron jobs
  - @blinkk/root@1.0.0-rc.38

## 1.0.0-rc.37

### Patch Changes

- Updated dependencies [f3e63b3]
  - @blinkk/root@1.0.0-rc.37

## 1.0.0-rc.36

### Minor Changes

- 8549176: feat: add options for linking to existing google sheets

### Patch Changes

- Updated dependencies [63d8af3]
  - @blinkk/root@1.0.0-rc.36

## 1.0.0-rc.35

### Patch Changes

- Updated dependencies [da95b72]
  - @blinkk/root@1.0.0-rc.35

## 1.0.0-rc.34

### Minor Changes

- 159f8b2: feat: add releases page

### Patch Changes

- Updated dependencies [4ce147d]
  - @blinkk/root@1.0.0-rc.34

## 1.0.0-rc.33

### Minor Changes

- c39c39e: feat: update security rules so only admins can edit project settings
- c39c39e: feat: add support for wildcard domain ACLS, e.g. `*@example.com`
- c39c39e: chore: validate ACL membership for every authenticated request
- df4fc27: feat: update security rules so only ADMIN can change project settings

### Patch Changes

- a6fddb8: chore: update ACL check until full-domain ACLs are supported
  - @blinkk/root@1.0.0-rc.33

## 1.0.0-rc.32

### Patch Changes

- 073cdaa: chore: select a collection by default
- 243afcc: fix: sort translations by source string
  - @blinkk/root@1.0.0-rc.32

## 1.0.0-rc.31

### Minor Changes

- c67881c: feat: basic arb download ui
- 2145120: feat: add edit translations page
- b40576d: feat: display avatars viewing current doc
- ae7c4f3: feat: add gcs file uploader button
- 356b357: feat: add data sources
- 5fe279c: feat: add edit data source page
- 7061ff6: feat: add http data sources

### Patch Changes

- 2366529: chore: preserve device state when navigating
- 6e4332e: chore: better error messages for login failures
- d8a207d: chore: add favicon to root cms
  - @blinkk/root@1.0.0-rc.31

## 1.0.0-rc.30

### Minor Changes

- 3b1a6e8: feat: google sheets localization

### Patch Changes

- @blinkk/root@1.0.0-rc.30

## 1.0.0-rc.29

### Minor Changes

- 48153bc: feat: add publishDocs() to cms client

### Patch Changes

- 4baddc5: re-load doc card when reference changes
- Updated dependencies [2709009]
  - @blinkk/root@1.0.0-rc.29

## 1.0.0-rc.28

### Patch Changes

- 556082f: chore: pin deps to exact versions
- Updated dependencies [556082f]
  - @blinkk/root@1.0.0-rc.28

## 1.0.0-rc.27

### Minor Changes

- 0a69a62: feat: add default value caching for object fields
- b0fed8a: feat: add reference field

### Patch Changes

- @blinkk/root@1.0.0-rc.27

## 1.0.0-rc.26

### Patch Changes

- Updated dependencies [a8f4d6d]
  - @blinkk/root@1.0.0-rc.26

## 1.0.0-rc.25

### Patch Changes

- fb23c6a: feat: update root cms logo
  - @blinkk/root@1.0.0-rc.25

## 1.0.0-rc.24

### Patch Changes

- 0be0a8c: fix: disable auth check for cron jobs
- Updated dependencies [b6363a2]
  - @blinkk/root@1.0.0-rc.24

## 1.0.0-rc.23

### Patch Changes

- 38902f2: fix: add error message for login failures
  - @blinkk/root@1.0.0-rc.23

## 1.0.0-rc.22

### Patch Changes

- Updated dependencies [dad8ddc]
  - @blinkk/root@1.0.0-rc.22

## 1.0.0-rc.21

### Patch Changes

- Updated dependencies [c9bf955]
  - @blinkk/root@1.0.0-rc.21

## 1.0.0-rc.20

### Patch Changes

- 4365554: feat: add defaultImage to schema previews
- 26f7846: feat: pass query params from cms to preview url
  - @blinkk/root@1.0.0-rc.20

## 1.0.0-rc.19

### Patch Changes

- 547ef5e: fix: fix sanitizer for underline and strikethrough
  - @blinkk/root@1.0.0-rc.19

## 1.0.0-rc.18

### Minor Changes

- 20fadd1: feat: add underline and strikethrough to rich text editor

### Patch Changes

- @blinkk/root@1.0.0-rc.18

## 1.0.0-rc.17

### Patch Changes

- Updated dependencies [40383ef]
  - @blinkk/root@1.0.0-rc.17

## 1.0.0-rc.16

### Patch Changes

- Updated dependencies [7f80435]
- Updated dependencies [9f1803b]
  - @blinkk/root@1.0.0-rc.16

## 1.0.0-rc.15

### Minor Changes

- ad27525: feat: add richtext component

### Patch Changes

- 9ad44fe: fix: fix initialization of richtext data
  - @blinkk/root@1.0.0-rc.15

## 1.0.0-rc.14

### Patch Changes

- 6347c59: build: remove richtext subpackage from root-cms
- Updated dependencies [e4eded3]
  - @blinkk/root@1.0.0-rc.14

## 1.0.0-rc.13

### Patch Changes

- 67cc4fc: refactor: move richtext into core folder
  - @blinkk/root@1.0.0-rc.13

## 1.0.0-rc.12

### Minor Changes

- 2455c96: build: upgrade to vite5 and update deps

### Patch Changes

- Updated dependencies [2455c96]
- Updated dependencies [1f3ab3c]
  - @blinkk/root@1.0.0-rc.12

## 1.0.0-rc.11

### Patch Changes

- Updated dependencies [7cbc507]
  - @blinkk/root@1.0.0-rc.11

## 1.0.0-rc.10

### Minor Changes

- 66d7e76: feat: add richtext schema field

### Patch Changes

- Updated dependencies [66d7e76]
  - @blinkk/root@1.0.0-rc.10

## 1.0.0-rc.9

### Patch Changes

- Updated dependencies [6a77ba6]
  - @blinkk/root@1.0.0-rc.9

## 1.0.0-rc.8

### Patch Changes

- Updated dependencies [8476fb3]
- Updated dependencies [27520ed]
  - @blinkk/root@1.0.0-rc.8

## 1.0.0-rc.7

### Minor Changes

- c49b76c: feat: add preserveFilename option to file schema

### Patch Changes

- @blinkk/root@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- 5975bf0: fix: fix split panel resizer
  - @blinkk/root@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [ddcbe58]
  - @blinkk/root@1.0.0-rc.5

## 1.0.0-rc.4

### Minor Changes

- 93c49d7: feat: add saveTranslations method to cms client

### Patch Changes

- ef5a450: fix: fix content overflow
  - @blinkk/root@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- 4067634: fix: add experimental fix for large collections
- 7f8d62f: fix: fix overflow issue
- 9f85f7c: fix: rename header to root cms
  - @blinkk/root@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- 8b56993: fix: remove vite dep from cms client
- b0b8a3c: fix: minimal signin ui
- b0df82e: fix: fix deps
- Updated dependencies [006df38]
- Updated dependencies [b0df82e]
- Updated dependencies [d05691c]
- Updated dependencies [2fa06c3]
  - @blinkk/root@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- afb0c01: feat: add RootCMSClient class

### Patch Changes

- 883735f: fix: re-indent 4-space generated types to 2
- 28e8e64: chore: upgrade deps
- 14e2ba1: fix: ignore schema dts from functions dir
- Updated dependencies [28e8e64]
  - @blinkk/root@1.0.0-rc.1

## 1.0.0-rc.0

### Major Changes

- a5cb6b1: feat: first release of root.js cms

### Minor Changes

- 6119500: feat: auto reload iframe when db is saved
- f083fd9: feat: update cache-control for gcs uploads to 1yr
- e492dea: feat: add drag/drop to file field
- 0523622: feat: use signed cookies for auth
- 34f7cdc: feat: add file upload field
- 8125496: feat: add buttonLabel config to array fields
- ff17522: feat: add icon to remove image
- 3e3a8f0: feat: add listDocs to root-cms and add example
- 35310eb: feat: add import csv translations
- da0e4ef: feat: add copy doc action menu
- 1f06f4e: feat: add revert draft action
- fff594b: feat: add orderByDirection to listDocs()
- c31304b: feat: save changes before preview reloads
- f843250: feat: add version history cron job
- b01b3b4: feat: add ui for listing and restoring versions
- 8a21902: feat: add numDocs() method for getting collection count
- dc095e3: feat: add localization config modal
- 1783ab7: feat: import strings to Translations collection
- 9afd451: feat: add svg to accept image types
- 523cd85: feat: add timezone info to datetime field
- ab2f82d: feat: add scheduled publishing
- 3517454: feat: add image drag/drop
- 3ae64e3: feat: add multipartMiddlware
- 81be985: feat: add session cookie middleware
- 1f68372: feat: add DateTime field

### Patch Changes

- e6334a5: feat: add query() option to numDocs()
- e026a45: feat: add project name to cms ui
- 4071fd1: feat: add basic image uploads and gci serving url
- b212258: fix: fix root-cms dist
- 83c9caf: fix: fix preview path
- de1f494: feat: add type def for date field
- 72491bb: fix: fix l10n modal locales checkbox
- 19e7bf2: fix: increase multer file size limit
- b36d4e0: fix: normalize nested arrays
- 1ad4139: fix: update type gen for image and datetime
- ee240c9: build: fix root-cms packaging
- 08d7cf4: fix: use singleton firebase app instance
- b9b8968: feat: add image alt text field
- 36d3ced: feat: add option for configuring gci
- ba53753: fix: add "en" as default locale
- 63cb83f: fix: fix collection page overflow
- a79aebc: fix: set cookie to secure=false on dev
- 46f2f59: fix: update session cookie name to match firebase
- 4960432: feat: allow docs with non-EN locale
- fbadf96: feat: add collection list to home page
- cf34e66: feat: add custom queries for listing docs
- ae16f58: fix: fix reload of iframe url
- c4613da: fix: extract all locales to csv
- 2ca60f4: feat: add root-cms init-firebase cli command
- cb99a12: fix: fix string normalization
- fed22ae: fix: add notification for image upload fail
- aa9cab4: fix: use memory storage for multer
- 729b313: feat: add locale toggle to preview window
- 596fd46: build: fix root-cms ci build
- 463f398: feat: add edit json modal
- d79782d: feat: start/stop db snapshots on visibility
- a36c2c6: feat: add server config to inject middleware
- f93eefa: fix: fix user sessions
- 5e579b3: chore: update node compatibility version
- 2997a1a: fix: filter docs by scheduledAt time
- d5b28cb: feat: add unpublish doc action
- 8064122: fix: fix cms package.json version in create-root
- 0b1ae54: fix: add app name to firebase getApp
- 193269e: feat: add root-cms package and schema definitions
- 15ae86f: fix: fix jwt token exp check
- 854c67f: fix: preserve image "alt" text
- 30f8f37: feat: add img dimens to preview box
- 85c87d4: fix: update labels for discarding draft edits
- 4f14b3c: feat: inject context vars to dev server requests
- 60c4bc1: fix: fix firstPublished for scheduled docs
- 5c55dc2: fix: set SameSite cookie attr
- c3b3f08: fix: fix localizedUrl for newTab button
- 34f1200: fix: fix login redirects
- 8eeeea3: feat: add boolean field to cms ui
- Updated dependencies [1884ecc]
- Updated dependencies [53b316e]
- Updated dependencies [b92cf04]
- Updated dependencies [d6e961c]
- Updated dependencies [46a35e2]
- Updated dependencies [e026a45]
- Updated dependencies [e1da510]
- Updated dependencies [a904e40]
- Updated dependencies [c1d7940]
- Updated dependencies [dc095e3]
- Updated dependencies [b2f6ff8]
- Updated dependencies [b537ce9]
- Updated dependencies [b36d4e0]
- Updated dependencies [7828b62]
- Updated dependencies [5a3fd59]
- Updated dependencies [8a39d33]
- Updated dependencies [31723f2]
- Updated dependencies [915029b]
- Updated dependencies [8b0bafb]
- Updated dependencies [1a60d4e]
- Updated dependencies [4f14b3c]
- Updated dependencies [fd20497]
- Updated dependencies [2219310]
- Updated dependencies [97d70b9]
- Updated dependencies [5169439]
- Updated dependencies [3e3a8f0]
- Updated dependencies [b3646b7]
- Updated dependencies [4f14b3c]
- Updated dependencies [98c4af7]
- Updated dependencies [bf9029f]
- Updated dependencies [79f8f13]
- Updated dependencies [38b6b6f]
- Updated dependencies [a5cb6b1]
- Updated dependencies [93f37a2]
- Updated dependencies [4f14b3c]
- Updated dependencies [90465ff]
- Updated dependencies [042309b]
- Updated dependencies [2ca60f4]
- Updated dependencies [7b5530a]
- Updated dependencies [207577d]
- Updated dependencies [4b0a586]
- Updated dependencies [c1dd173]
- Updated dependencies [29ca06c]
- Updated dependencies [894e2f3]
- Updated dependencies [f587c74]
- Updated dependencies [6799b64]
- Updated dependencies [fd0bf90]
- Updated dependencies [cfa193f]
- Updated dependencies [17b7e51]
- Updated dependencies [1b6024d]
- Updated dependencies [03d468e]
- Updated dependencies [2747d11]
- Updated dependencies [e8ba905]
- Updated dependencies [c0245ca]
- Updated dependencies [0735d64]
- Updated dependencies [980ad39]
- Updated dependencies [fed22ae]
- Updated dependencies [90c5fc6]
- Updated dependencies [08c7b17]
- Updated dependencies [5369f0e]
- Updated dependencies [6c9cf6f]
- Updated dependencies [67c9731]
- Updated dependencies [298456f]
- Updated dependencies [2ef1d63]
- Updated dependencies [f80b585]
- Updated dependencies [e0eb4d1]
- Updated dependencies [345dbb6]
- Updated dependencies [a36c2c6]
- Updated dependencies [3c9043f]
- Updated dependencies [33869c5]
- Updated dependencies [81c367e]
- Updated dependencies [8417984]
- Updated dependencies [05a0e06]
- Updated dependencies [5e579b3]
- Updated dependencies [210630d]
- Updated dependencies [ea71e3f]
- Updated dependencies [3ed4621]
- Updated dependencies [75dffaf]
- Updated dependencies [6adf9d1]
- Updated dependencies [e5ec123]
- Updated dependencies [03a1f46]
- Updated dependencies [6319234]
- Updated dependencies [8d3c8c2]
- Updated dependencies [8064122]
- Updated dependencies [f1bdaf6]
- Updated dependencies [c8a7250]
- Updated dependencies [ed1bcf8]
- Updated dependencies [63d6b6c]
- Updated dependencies [40d5693]
- Updated dependencies [f9e00d2]
- Updated dependencies [3ae64e3]
- Updated dependencies [6d4b8a7]
- Updated dependencies [81be985]
- Updated dependencies [fe802b3]
- Updated dependencies [e696c9b]
- Updated dependencies [ea71e3f]
- Updated dependencies [f264412]
- Updated dependencies [5c55dc2]
- Updated dependencies [4f14b3c]
- Updated dependencies [dc4d11e]
- Updated dependencies [d602474]
- Updated dependencies [06fbcf9]
- Updated dependencies [b9838fd]
- Updated dependencies [dd0926d]
- Updated dependencies [ea71e3f]
  - @blinkk/root@1.0.0-rc.0

## 1.0.0-beta.64

### Patch Changes

- c4613da: fix: extract all locales to csv
  - @blinkk/root@1.0.0-beta.64

## 1.0.0-beta.63

### Minor Changes

- b01b3b4: feat: add ui for listing and restoring versions

### Patch Changes

- @blinkk/root@1.0.0-beta.63

## 1.0.0-beta.62

### Minor Changes

- f083fd9: feat: update cache-control for gcs uploads to 1yr
- f843250: feat: add version history cron job

### Patch Changes

- @blinkk/root@1.0.0-beta.62

## 1.0.0-beta.61

### Patch Changes

- Updated dependencies [33869c5]
  - @blinkk/root@1.0.0-beta.61

## 1.0.0-beta.60

### Patch Changes

- Updated dependencies [3c9043f]
  - @blinkk/root@1.0.0-beta.60

## 1.0.0-beta.59

### Minor Changes

- 81be985: feat: add session cookie middleware

### Patch Changes

- Updated dependencies [81be985]
  - @blinkk/root@1.0.0-beta.59

## 1.0.0-beta.58

### Minor Changes

- e492dea: feat: add drag/drop to file field
- 3517454: feat: add image drag/drop

### Patch Changes

- @blinkk/root@1.0.0-beta.58

## 1.0.0-beta.57

### Patch Changes

- 4960432: feat: allow docs with non-EN locale
  - @blinkk/root@1.0.0-beta.57

## 1.0.0-beta.56

### Patch Changes

- ba53753: fix: add "en" as default locale
- 85c87d4: fix: update labels for discarding draft edits
  - @blinkk/root@1.0.0-beta.56

## 1.0.0-beta.55

### Patch Changes

- Updated dependencies [29ca06c]
  - @blinkk/root@1.0.0-beta.55

## 1.0.0-beta.54

### Patch Changes

- Updated dependencies [6adf9d1]
  - @blinkk/root@1.0.0-beta.54

## 1.0.0-beta.53

### Minor Changes

- 3ae64e3: feat: add multipartMiddlware

### Patch Changes

- de1f494: feat: add type def for date field
- 1ad4139: fix: update type gen for image and datetime
- Updated dependencies [3ae64e3]
  - @blinkk/root@1.0.0-beta.53

## 1.0.0-beta.52

### Minor Changes

- 523cd85: feat: add timezone info to datetime field

### Patch Changes

- Updated dependencies [fd20497]
  - @blinkk/root@1.0.0-beta.52

## 1.0.0-beta.51

### Minor Changes

- 1f68372: feat: add DateTime field

### Patch Changes

- Updated dependencies [298456f]
  - @blinkk/root@1.0.0-beta.51

## 1.0.0-beta.50

### Patch Changes

- 19e7bf2: fix: increase multer file size limit
- 63cb83f: fix: fix collection page overflow
- Updated dependencies [8b0bafb]
- Updated dependencies [c1dd173]
  - @blinkk/root@1.0.0-beta.50

## 1.0.0-beta.49

### Patch Changes

- aa9cab4: fix: use memory storage for multer
  - @blinkk/root@1.0.0-beta.49

## 1.0.0-beta.48

### Patch Changes

- Updated dependencies [8a39d33]
- Updated dependencies [1b6024d]
  - @blinkk/root@1.0.0-beta.48

## 1.0.0-beta.47

### Patch Changes

- Updated dependencies [b3646b7]
  - @blinkk/root@1.0.0-beta.47

## 1.0.0-beta.46

### Patch Changes

- cb99a12: fix: fix string normalization
  - @blinkk/root@1.0.0-beta.46

## 1.0.0-beta.45

### Patch Changes

- 463f398: feat: add edit json modal
  - @blinkk/root@1.0.0-beta.45

## 1.0.0-beta.44

### Patch Changes

- e6334a5: feat: add query() option to numDocs()
- c3b3f08: fix: fix localizedUrl for newTab button
  - @blinkk/root@1.0.0-beta.44

## 1.0.0-beta.43

### Patch Changes

- ae16f58: fix: fix reload of iframe url
  - @blinkk/root@1.0.0-beta.43

## 1.0.0-beta.42

### Patch Changes

- 83c9caf: fix: fix preview path
  - @blinkk/root@1.0.0-beta.42

## 1.0.0-beta.41

### Patch Changes

- cf34e66: feat: add custom queries for listing docs
- 729b313: feat: add locale toggle to preview window
  - @blinkk/root@1.0.0-beta.41

## 1.0.0-beta.40

### Patch Changes

- Updated dependencies [3ed4621]
  - @blinkk/root@1.0.0-beta.40

## 1.0.0-beta.39

### Patch Changes

- 72491bb: fix: fix l10n modal locales checkbox
  - @blinkk/root@1.0.0-beta.39

## 1.0.0-beta.38

### Minor Changes

- 1783ab7: feat: import strings to Translations collection

### Patch Changes

- @blinkk/root@1.0.0-beta.38

## 1.0.0-beta.37

### Patch Changes

- Updated dependencies [6319234]
  - @blinkk/root@1.0.0-beta.37

## 1.0.0-beta.36

### Patch Changes

- Updated dependencies [8417984]
  - @blinkk/root@1.0.0-beta.36

## 1.0.0-beta.35

### Patch Changes

- 2997a1a: fix: filter docs by scheduledAt time
  - @blinkk/root@1.0.0-beta.35

## 1.0.0-beta.34

### Patch Changes

- 08d7cf4: fix: use singleton firebase app instance
- 60c4bc1: fix: fix firstPublished for scheduled docs
  - @blinkk/root@1.0.0-beta.34

## 1.0.0-beta.33

### Patch Changes

- 0b1ae54: fix: add app name to firebase getApp
  - @blinkk/root@1.0.0-beta.33

## 1.0.0-beta.32

### Minor Changes

- 1f06f4e: feat: add revert draft action
- ab2f82d: feat: add scheduled publishing

### Patch Changes

- Updated dependencies [e5ec123]
  - @blinkk/root@1.0.0-beta.32

## 1.0.0-beta.31

### Minor Changes

- 9afd451: feat: add svg to accept image types

### Patch Changes

- Updated dependencies [5a3fd59]
- Updated dependencies [4b0a586]
- Updated dependencies [fd0bf90]
- Updated dependencies [06fbcf9]
  - @blinkk/root@1.0.0-beta.31

## 1.0.0-beta.30

### Patch Changes

- 5c55dc2: fix: set SameSite cookie attr
- Updated dependencies [5c55dc2]
  - @blinkk/root@1.0.0-beta.30

## 1.0.0-beta.29

### Patch Changes

- 46f2f59: fix: update session cookie name to match firebase
  - @blinkk/root@1.0.0-beta.29

## 1.0.0-beta.28

### Minor Changes

- 0523622: feat: use signed cookies for auth

### Patch Changes

- Updated dependencies [5369f0e]
  - @blinkk/root@1.0.0-beta.28

## 1.0.0-beta.27

### Patch Changes

- Updated dependencies [dd0926d]
  - @blinkk/root@1.0.0-beta.27

## 1.0.0-beta.26

### Patch Changes

- Updated dependencies [cfa193f]
  - @blinkk/root@1.0.0-beta.26

## 1.0.0-beta.25

### Minor Changes

- 6119500: feat: auto reload iframe when db is saved
- 35310eb: feat: add import csv translations
- da0e4ef: feat: add copy doc action menu

### Patch Changes

- a79aebc: fix: set cookie to secure=false on dev
  - @blinkk/root@1.0.0-beta.25

## 1.0.0-beta.24

### Patch Changes

- Updated dependencies [ea71e3f]
- Updated dependencies [ea71e3f]
- Updated dependencies [ea71e3f]
  - @blinkk/root@1.0.0-beta.24

## 1.0.0-beta.23

### Minor Changes

- dc095e3: feat: add localization config modal

### Patch Changes

- Updated dependencies [dc095e3]
- Updated dependencies [75dffaf]
  - @blinkk/root@1.0.0-beta.23

## 1.0.0-beta.22

### Minor Changes

- 8125496: feat: add buttonLabel config to array fields
- ff17522: feat: add icon to remove image
- c31304b: feat: save changes before preview reloads

### Patch Changes

- 15ae86f: fix: fix jwt token exp check
- Updated dependencies [90465ff]
  - @blinkk/root@1.0.0-beta.22

## 1.0.0-beta.21

### Minor Changes

- 34f7cdc: feat: add file upload field

### Patch Changes

- Updated dependencies [03a1f46]
  - @blinkk/root@1.0.0-beta.21

## 1.0.0-beta.20

### Patch Changes

- Updated dependencies [0735d64]
  - @blinkk/root@1.0.0-beta.20

## 1.0.0-beta.19

### Patch Changes

- Updated dependencies [fe802b3]
  - @blinkk/root@1.0.0-beta.19

## 1.0.0-beta.18

### Minor Changes

- 8a21902: feat: add numDocs() method for getting collection count

### Patch Changes

- Updated dependencies [d602474]
  - @blinkk/root@1.0.0-beta.18

## 1.0.0-beta.17

### Minor Changes

- fff594b: feat: add orderByDirection to listDocs()

### Patch Changes

- @blinkk/root@1.0.0-beta.17

## 1.0.0-beta.16

### Minor Changes

- 3e3a8f0: feat: add listDocs to root-cms and add example

### Patch Changes

- Updated dependencies [3e3a8f0]
  - @blinkk/root@1.0.0-beta.16

## 1.0.0-beta.15

### Patch Changes

- 34f1200: fix: fix login redirects
- 8eeeea3: feat: add boolean field to cms ui
  - @blinkk/root@1.0.0-beta.15

## 1.0.0-beta.14

### Patch Changes

- fbadf96: feat: add collection list to home page
- f93eefa: fix: fix user sessions
- 30f8f37: feat: add img dimens to preview box
  - @blinkk/root@1.0.0-beta.14

## 1.0.0-beta.13

### Patch Changes

- Updated dependencies [980ad39]
  - @blinkk/root@1.0.0-beta.13

## 1.0.0-beta.12

### Patch Changes

- Updated dependencies [1930fe1]
  - @blinkk/root@1.0.0-beta.12

## 1.0.0-beta.11

### Patch Changes

- Updated dependencies [79f8f13]
  - @blinkk/root@1.0.0-beta.11

## 1.0.0-beta.10

### Patch Changes

- Updated dependencies [f587c74]
  - @blinkk/root@1.0.0-beta.10

## 1.0.0-beta.9

### Patch Changes

- Updated dependencies [bf9029f]
  - @blinkk/root@1.0.0-beta.9

## 1.0.0-beta.8

### Patch Changes

- 854c67f: fix: preserve image "alt" text
- Updated dependencies [98c4af7]
  - @blinkk/root@1.0.0-beta.8

## 1.0.0-beta.7

### Patch Changes

- b9b8968: feat: add image alt text field
  - @blinkk/root@1.0.0-beta.7

## 1.0.0-beta.6

### Patch Changes

- b36d4e0: fix: normalize nested arrays
- Updated dependencies [b36d4e0]
  - @blinkk/root@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- 36d3ced: feat: add option for configuring gci
- d5b28cb: feat: add unpublish doc action
- Updated dependencies [210630d]
  - @blinkk/root@1.0.0-beta.5

## 1.0.0-beta.4

### Patch Changes

- e026a45: feat: add project name to cms ui
- fed22ae: fix: add notification for image upload fail
- Updated dependencies [e026a45]
- Updated dependencies [fed22ae]
- Updated dependencies [40d5693]
  - @blinkk/root@1.0.0-beta.4

## 1.0.0-beta.3

### Patch Changes

- 4071fd1: feat: add basic image uploads and gci serving url
- Updated dependencies [207577d]
  - @blinkk/root@1.0.0-beta.3

## 1.0.0-beta.2

### Patch Changes

- Updated dependencies [a904e40]
  - @blinkk/root@1.0.0-beta.2

## 1.0.0-beta.1

### Patch Changes

- 2ca60f4: feat: add root-cms init-firebase cli command
- d79782d: feat: start/stop db snapshots on visibility
- 5e579b3: chore: update node compatibility version
- 8064122: fix: fix cms package.json version in create-root
- Updated dependencies [2ca60f4]
- Updated dependencies [894e2f3]
- Updated dependencies [6799b64]
- Updated dependencies [5e579b3]
- Updated dependencies [8064122]
  - @blinkk/root@1.0.0-beta.1

## 1.0.0-beta.0

### Major Changes

- a5cb6b1: feat: first release of root.js cms

### Patch Changes

- Updated dependencies [a5cb6b1]
  - @blinkk/root@1.0.0-beta.0

## 1.0.0-alpha.29

### Patch Changes

- Updated dependencies [05a0e06]
  - @blinkk/root@1.0.0-alpha.36

## 1.0.0-alpha.28

### Patch Changes

- Updated dependencies [90c5fc6]
  - @blinkk/root@1.0.0-alpha.35

## 1.0.0-alpha.27

### Patch Changes

- Updated dependencies [97d70b9]
  - @blinkk/root@1.0.0-alpha.34

## 1.0.0-alpha.26

### Patch Changes

- Updated dependencies [b537ce9]
- Updated dependencies [345dbb6]
  - @blinkk/root@1.0.0-alpha.33

## 1.0.0-alpha.25

### Patch Changes

- Updated dependencies [dc4d11e]
  - @blinkk/root@1.0.0-alpha.32

## 1.0.0-alpha.24

### Patch Changes

- Updated dependencies [915029b]
- Updated dependencies [2219310]
  - @blinkk/root@1.0.0-alpha.31

## 1.0.0-alpha.23

### Patch Changes

- Updated dependencies [d6e961c]
- Updated dependencies [7b5530a]
- Updated dependencies [6d4b8a7]
  - @blinkk/root@1.0.0-alpha.30

## 1.0.0-alpha.22

### Patch Changes

- Updated dependencies [81c367e]
  - @blinkk/root@1.0.0-alpha.29

## 1.0.0-alpha.21

### Patch Changes

- Updated dependencies [2747d11]
  - @blinkk/root@1.0.0-alpha.28

## 1.0.0-alpha.20

### Patch Changes

- Updated dependencies [2ef1d63]
  - @blinkk/root@1.0.0-alpha.27

## 1.0.0-alpha.19

### Patch Changes

- Updated dependencies [1a60d4e]
  - @blinkk/root@1.0.0-alpha.26

## 1.0.0-alpha.18

### Patch Changes

- Updated dependencies [f1bdaf6]
  - @blinkk/root@1.0.0-alpha.25

## 1.0.0-alpha.17

### Patch Changes

- Updated dependencies [93f37a2]
  - @blinkk/root@1.0.0-alpha.24

## 1.0.0-alpha.16

### Patch Changes

- Updated dependencies [b92cf04]
  - @blinkk/root@1.0.0-alpha.23

## 1.0.0-alpha.15

### Patch Changes

- Updated dependencies [f9e00d2]
  - @blinkk/root@1.0.0-alpha.22

## 1.0.0-alpha.14

### Patch Changes

- Updated dependencies [53b316e]
  - @blinkk/root@1.0.0-alpha.21

## 1.0.0-alpha.13

### Patch Changes

- Updated dependencies [7828b62]
  - @blinkk/root@1.0.0-alpha.20

## 1.0.0-alpha.12

### Patch Changes

- Updated dependencies [b2f6ff8]
- Updated dependencies [6c9cf6f]
  - @blinkk/root@1.0.0-alpha.19

## 1.0.0-alpha.11

### Patch Changes

- Updated dependencies [46a35e2]
  - @blinkk/root@1.0.0-alpha.18

## 1.0.0-alpha.10

### Patch Changes

- Updated dependencies [c0245ca]
  - @blinkk/root@1.0.0-alpha.17

## 1.0.0-alpha.9

### Patch Changes

- Updated dependencies [38b6b6f]
  - @blinkk/root@1.0.0-alpha.16

## 1.0.0-alpha.8

### Patch Changes

- Updated dependencies [03d468e]
  - @blinkk/root@1.0.0-alpha.15

## 1.0.0-alpha.7

### Patch Changes

- Updated dependencies [8d3c8c2]
  - @blinkk/root@1.0.0-alpha.14

## 1.0.0-alpha.6

### Patch Changes

- Updated dependencies [f80b585]
  - @blinkk/root@1.0.0-alpha.13

## 1.0.0-alpha.5

### Patch Changes

- 4f14b3c: feat: inject context vars to dev server requests
- Updated dependencies [4f14b3c]
- Updated dependencies [4f14b3c]
- Updated dependencies [4f14b3c]
- Updated dependencies [4f14b3c]
  - @blinkk/root@1.0.0-alpha.12

## 1.0.0-alpha.4

### Patch Changes

- a36c2c6: feat: add server config to inject middleware

## 1.0.0-alpha.3

### Patch Changes

- 596fd46: build: fix root-cms ci build

## 1.0.0-alpha.2

### Patch Changes

- ee240c9: build: fix root-cms packaging

## 1.0.0-alpha.1

### Patch Changes

- b212258: fix: fix root-cms dist

## 1.0.1-alpha.0

### Patch Changes

- feat: add root-cms package and schema definitions
