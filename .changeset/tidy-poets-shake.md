---
'@blinkk/root-cms': patch
---

Send CSV imports as JSON instead of multipart/form-data. Some deployments sit behind WAFs/proxies that block multipart requests; the csv.import endpoint now accepts a JSON body (`{"csv": "..."}`) and the CMS UI sends JSON. Multipart uploads remain supported for backwards compatibility.
