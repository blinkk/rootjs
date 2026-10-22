# Update the developer docs: cms--multi-site

- **id:** `2026-10-21-cms-multi-site`
- **version:** 1
- **author:** scripts/propose_docs_copy.ts
- **generated:** 2026-10-21T16:53:04.704Z

## Summary

- Docs/cms--multi-site: New page on serving multiple sites from one deployment with the resolveSite option: resolving the site per request, creating sites, access and storage, and scripts and scheduled jobs.

## Create `Docs/cms--multi-site`

New page on serving multiple sites from one deployment with the resolveSite option: resolving the site per request, creating sites, access and storage, and scripts and scheduled jobs.

```yaml
meta:
  title: "Serving multiple sites – Root.js"
  description: "Serve many sites from one deployment, each with its own content, uploads and roles, by resolving the site for each request."
  category: "cms"
  navLabel: "Multiple sites"
content:
  title: "Serving multiple sites"
  body:
    blocks:
      - type: "paragraph"
        data:
          text: "One deployment can serve many sites, each with its own content, uploads bucket and roles. That's useful when sites are created at runtime, e.g. a site per subdomain for each customer or trial, and a deploy per site isn't practical."
      - type: "paragraph"
        data:
          text: "Each site's content is stored under <code>Projects/&lt;id&gt;</code> in Firestore, the same as a single site configured with the <code>id</code> option. The difference is that the site is chosen for each request instead of in <code>root.config.ts</code>."
    time: 1792601584060
    version: "2.28.2"
  sections:
    - id: "resolve-site"
      title: "Resolving the site"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "<code>resolveSite(req)</code> is called once per request and returns the site to serve. For the rest of the request, its <code>id</code>, <code>name</code> and <code>storageBucket</code> replace the <code>id</code>, <code>name</code> and <code>firebaseConfig.storageBucket</code> options, and its <code>domain</code> replaces <code>domain</code> in <code>root.config.ts</code>, which the CMS uses for doc URLs and live links. Everything that runs during the request picks up the site, including the CMS, its sign-in page and any <code>RootCMSClient</code> your routes create:"
        time: 1792601584060
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            // @/root.config.ts

            cmsPlugin({
              // Used outside of a request, e.g. by scripts. See below.
              id: 'www',
              firebaseConfig: {
                // ...
              },
              resolveSite: async (req) => {
                const site = await lookupSite(req.hostname);
                if (!site) {
                  return null;
                }
                return {
                  id: site.id,
                  name: site.name,
                  storageBucket: site.bucket,
                  domain: `https://${req.hostname}`,
                };
              },
            }),
        - _type: "CopyBlock"
          body:
            blocks:
              - type: "paragraph"
                data:
                  text: "Only <code>id</code> is required; the other values fall back to the static options. Returning <code>null</code> responds with a 404."
              - type: "paragraph"
                data:
                  text: "<code>resolveSite</code> runs for every request the server handles, not only CMS pages, so return a site for every host you serve (including your main domain) and cache lookups that hit a database."
            time: 1792601584060
            version: "2.28.2"
    - id: "creating-sites"
      title: "Creating a site"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "A site exists once its <code>Projects/&lt;id&gt;</code> doc has roles, the same list of roles that the Settings page edits. To create one from your own code, e.g. a sign-up flow, write the doc with the plugin's Firestore instance:"
        time: 1792601584060
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            const cmsPlugin = getCmsPlugin(rootConfig);
            const db = cmsPlugin.getFirestore();
            await db.doc(`Projects/${siteId}`).set({
              roles: {'owner@example.com': 'ADMIN'},
            });
    - id: "access-and-storage"
      title: "Access and storage"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Sites are isolated by the same <a href=\"/docs/cms/#security-rules\">security rules</a> as a single site. Users can only sign in to a site where they have a role, and Firestore and Storage only let them read and write that site's data."
          - type: "paragraph"
            data:
              text: "<code>isUserAuthorized(req, user, site)</code> gets the resolved site as its third argument, for rules that depend on the site:"
        time: 1792601584060
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            // @/root.config.ts

            cmsPlugin({
              // ...
              isUserAuthorized: async (req, user, site) => {
                const account = await lookupSite(site.id);
                return !account?.expired;
              },
            }),
        - _type: "CopyBlock"
          body:
            blocks:
              - type: "paragraph"
                data:
                  text: "Uploads are stored under <code>&lt;id&gt;/uploads/</code> in the site's bucket. A bucket other than your default one needs the CMS's Storage rules too."
            time: 1792601584060
            version: "2.28.2"
    - id: "outside-requests"
      title: "Scripts and scheduled jobs"
      body:
        blocks:
          - type: "paragraph"
            data:
              text: "Outside of a request, the static <code>id</code> option is used. <code>runWithSite()</code> runs code as a specific site, e.g. in a script that seeds a new site's content:"
        time: 1792601584060
        version: "2.28.2"
      blocks:
        - _type: "CodeBlock"
          language: "ts"
          code: |-
            const cmsPlugin = getCmsPlugin(rootConfig);
            await cmsPlugin.runWithSite({id: 'acme'}, async () => {
              const cmsClient = new RootCMSClient(rootConfig);
              await cmsClient.saveDraftData('Pages/index', {
                meta: {title: 'Welcome'},
              });
            });
        - _type: "CopyBlock"
          body:
            blocks:
              - type: "paragraph"
                data:
                  text: "The <a href=\"/docs/cms/#cron-jobs\">scheduled job</a> runs for one site at a time. The <code>/cms/api/cron.run</code> endpoint runs it for the site its request resolves to, so schedule a call to each site's host. The <code>cron</code> function from <code>@blinkk/root-cms/functions</code> only runs it for the static <code>id</code>."
            time: 1792601584060
            version: "2.28.2"
```
