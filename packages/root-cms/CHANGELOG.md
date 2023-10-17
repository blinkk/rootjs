# @blinkk/root-cms

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
