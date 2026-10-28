---
'@blinkk/root-cms': patch
---

fix: store release rollback snapshots without nesting the previous data, so releases with deeply nested docs no longer fail to publish with "Property previous contains an invalid nested entity"
