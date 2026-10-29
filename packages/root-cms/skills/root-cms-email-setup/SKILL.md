---
name: root-cms-email-setup
description: >-
  Set up email notifications for a Root.js CMS: deploy the Root.js email
  service (`apps/root-services`, a small App Engine app that sends queued
  emails with the App Engine Mail API) to the site's Google Cloud project,
  schedule it, wire `emailNotifications()` and `commentEmailNotifications()`
  into `cmsPlugin()`, and add ready-to-use templates for release, publish,
  publishing-lock and comment emails. Use this when asked to "set up CMS
  emails", "email me when something is published", "turn on comment
  notifications", or to deploy the Root.js email service.
---

# Setting up CMS email notifications

The CMS doesn't send email itself. When an action matches a notification
service in `cmsPlugin({notifications})`, the CMS renders the email and queues
it in Firestore at `Projects/<site id>/Emails`. The Root.js email service
reads that queue and sends each email with the App Engine Mail API. The
service lives in the Root.js repo at `apps/root-services`.

The service reads the Firestore database of the Google Cloud project it runs
in, so it has to be deployed to the **same project as the site's Firestore
database**. (The hosted `https://services.rootjs.dev`, which
`emailService: true` points at, only reads its own project's queue.)

The goal is:

1. The email service deployed to App Engine in the site's project.
2. A Cloud Scheduler job that runs it every few minutes, to send anything the
   CMS's immediate trigger missed.
3. `cms/emails.ts` with the templates, registered in `root.config.ts`.
4. A test email that arrived.

## Know the limits first

The App Engine Mail API sends to at most **100 recipients a day**, at **8 a
minute**, and each recipient of an email counts separately. Emails over the
rate limit are marked `failed` in the queue and aren't retried. Tell the user
this before they pick recipients, and suggest:

- Sending alerts to one Google Group address rather than to each person on a
  team. A group counts as one recipient.
- Release emails rather than publish emails, if the team uses releases.
  Publishing a release also publishes each doc in it, so publish emails send
  one email per doc.

A team that needs more should send through a provider such as SendGrid with a
custom notification service (see
`https://rootjs.dev/docs/cms/notifications/`) instead of this service.

## Step 1 — Agree on the plan

Read `root.config.ts` first. The `cmsPlugin()` options give you the site id
(`id`), the Google Cloud project (`firebaseConfig.projectId`) and whether
there are already `notifications`; `domain` in the Root config is where the
CMS is served. Then ask these together, once, with the defaults filled in:

| Question                                               | Default                                |
| ------------------------------------------------------ | -------------------------------------- |
| Google Cloud project                                   | `firebaseConfig.projectId`             |
| Site name, for subjects and footers                    | the project's name                     |
| URL the CMS is served from, for links                  | `domain` in `root.config.ts`           |
| Who gets release emails (publish, schedule, roll back) | none, must ask                         |
| Who gets single-doc publish emails                     | nobody                                 |
| Who gets publishing lock emails                        | nobody                                 |
| Email people `@mentioned` in field comments            | yes                                    |
| Sender address                                         | `noreply@<project-id>.appspotmail.com` |

A different sender must be an **authorized sender** for the Mail API: a Google
account or group the user owns or manages, added under App Engine → Settings →
Email API authorized senders in the Cloud console. Any
`<anything>@<project-id>.appspotmail.com` address works without that.

Tell the user what the deploy involves (the next steps), and that they'll
confirm before anything is created or deployed.

## Step 2 — Check the tools and the project

```bash
gcloud auth list --filter=status:ACTIVE --format="value(account)"
gcloud app describe --project=PROJECT --format="value(locationId,servingStatus)"
gcloud app services list --project=PROJECT
```

If gcloud isn't signed in, **ask the user to run `gcloud auth login`
themselves** (in Claude Code, `! gcloud auth login`); it opens a browser and
hangs a non-interactive shell. Their account needs to be an Owner or Editor on
the project.

What the output tells you:

- `gcloud app describe` fails with "does not contain an App Engine
  application": there's no App Engine app yet. Step 4 creates one.
- `gcloud app services list` shows `root-services`: the service is already
  deployed (another site in the project may use it). Skip to step 6 and reuse
  its URL; one deployment serves every site in the project.
- No services, or no app: the first service an App Engine app gets must be
  called `default`, so deploy this one as `default` (step 3).

The service only reads the project's `(default)` Firestore database. If
`firebaseConfig.databaseId` is set to anything else, stop and tell the user:
the service can't reach that database yet.

## Step 3 — Get the service

Copy the service's source into the project, so it can be redeployed later:

```bash
mkdir -p services/email
base=https://raw.githubusercontent.com/blinkk/rootjs/main/apps/root-services
for f in main.go go.mod go.sum app.yaml .gcloudignore; do
  curl -fsSL "$base/$f" -o "services/email/$f"
done
```

`app.yaml` names the service `root-services`. If step 2 found no services,
change that line to `service: default`.

The service also has `/_/serving_url` and `/_/service_account` endpoints, which
the CMS can use for image serving URLs. They do nothing unless called.

## Step 4 — Set up the project

Get a go-ahead first, then:

```bash
gcloud services enable appengine.googleapis.com cloudbuild.googleapis.com \
  cloudscheduler.googleapis.com --project=PROJECT
```

If there's no App Engine app, create one. **Its region can never be changed**,
so ask the user, suggesting the one nearest the Firestore database (e.g.
`us-central` for `nam5` or `us-central1`, `europe-west` for `eur3`):

```bash
gcloud app create --project=PROJECT --region=us-central
```

The service runs as the App Engine default service account, which needs to
read and update the email queue in Firestore:

```bash
gcloud projects add-iam-policy-binding PROJECT \
  --member="serviceAccount:PROJECT@appspot.gserviceaccount.com" \
  --role="roles/datastore.user" --condition=None
```

The service finds pending emails with a query that needs a composite index on
the `Emails` collection. Create it now, since it takes a few minutes to build
(an "already exists" error means it's there):

```bash
gcloud firestore indexes composite create --project=PROJECT \
  --collection-group=Emails --query-scope=COLLECTION \
  --field-config=field-path=status,order=ascending \
  --field-config=field-path=createdAt,order=ascending
```

## Step 5 — Deploy

```bash
gcloud app deploy services/email/app.yaml --project=PROJECT \
  --version=prod --promote --quiet
```

The first deploy builds the Go app with Cloud Build and can take a few
minutes. Then get the service's URL and check it answers for the site:

```bash
gcloud app browse --service=root-services --project=PROJECT --no-launch-browser
curl -s "SERVICE_URL/_/send_emails?projectId=SITE_ID"
```

Drop `--service=root-services` if you deployed it as `default`. The curl
should print `{"success":true,"sent":0,"failed":0}`. `projectId` is the
CMS's site id (`cmsPlugin({id})`), not the Google Cloud project id.

| Problem                                                     | Fix                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deploy fails with a Cloud Build or storage permission error | Grant the account named in the error `roles/cloudbuild.builds.builder`, then deploy again.                                                                                                                                                                                                                          |
| `failed to process emails`                                  | Check the logs (`gcloud app logs read --service=root-services --project=PROJECT`). A `PermissionDenied` means the step 4 IAM binding is missing. A `FailedPrecondition` about an index means the step 4 index is missing or still building; check with `gcloud firestore indexes composite list --project=PROJECT`. |
| Emails `failed` with an unauthorized sender error           | The `from` address isn't an authorized sender (step 1).                                                                                                                                                                                                                                                             |

## Step 6 — Schedule it

The CMS triggers the service as soon as an email is queued, but doesn't wait
for it, so a trigger can be lost (for example when the server shuts down
right after the request). A Cloud Scheduler job picks up anything left behind:

```bash
gcloud scheduler jobs create http root-cms-emails-SITE_ID \
  --project=PROJECT --location=us-central1 \
  --schedule="*/5 * * * *" --http-method=GET \
  --uri="SERVICE_URL/_/send_emails?projectId=SITE_ID"
```

Make one job per site id. If the job exists, update it with
`gcloud scheduler jobs update http` and the same flags. The templates expire
unsent emails after an hour, so a long outage doesn't send a pile of stale
emails when it ends.

## Step 7 — Add the templates

Copy `templates/emails.ts` from this skill to `cms/emails.ts` in the project.
It exports `cmsEmails()`, which returns the notification services for the
options it's given, and each service on its own (`releaseEmails()`,
`publishEmails()`, `lockEmails()` and `commentEmails()`) for projects that want
to mix them with others. Each email has a heading, who did it, the publish
message or lock reason, a list of the docs in a release, and a button that
links into the CMS, as HTML with a plain-text version.

Register it in `root.config.ts`:

```ts
import {cmsEmails} from './cms/emails.js';

// ...
cmsPlugin({
  // ...
  notifications: cmsEmails({
    siteName: 'My Site',
    cmsUrl: 'https://example.com',
    emailService: 'SERVICE_URL',
    releaseAlerts: ['web-team@example.com'],
  }),
}),
```

If `notifications` already has services, keep them:
`notifications: [...existing, ...cmsEmails({...})]`. Fill in only the options
the user chose in step 1; unset alert lists turn that email off.

To change what an email says, edit `cms/emails.ts`: the `template` function in
each service builds its content, and `renderEmail()` the layout. Keep the HTML
simple with inline styles, which is what email clients render reliably.
Template functions' output isn't escaped for you, so pass any value from an
action through `esc()`.

## Step 8 — Send a test email

Queue a test email to the user, then run the service so it's sent right away:

```bash
pnpm exec root-cms client.call sendEmail '[{
  "to": ["USER_EMAIL"],
  "subject": "Test email from the CMS",
  "body": "If you got this, CMS emails work."
}]'
curl -s "SERVICE_URL/_/send_emails?projectId=SITE_ID"
```

The curl should report `"sent":1`. To try a template, log an action that it
listens to. The CLI loads `root.config.ts`, so the notification services run
just as they do in the CMS:

```bash
pnpm exec root-cms client.call logAction '["release.publish", {
  "by": "USER_EMAIL",
  "metadata": {"releaseId": "test", "docIds": ["Pages/index"]}
}]'
curl -s "SERVICE_URL/_/send_emails?projectId=SITE_ID"
```

This only records a fake action in the CMS's action log; it doesn't publish
anything. Ask the user before running it, and make sure the recipients are
people who expect a test. Ask the user to check their inbox, including spam;
an `appspotmail.com` sender sometimes lands there at first.

## Step 9 — Commit and hand off

Commit `services/email/`, `cms/emails.ts` and the `root.config.ts` change. The
new notifications take effect when the site is next deployed.

Tell the user, briefly:

- The service URL, the Scheduler job, and who gets which emails.
- The 100-recipients-a-day limit, and where the queue is
  (`Projects/<site id>/Emails` in Firestore, with each email's `status`).
- How to redeploy the service after pulling a newer copy:
  the step 5 `gcloud app deploy` command.

## Guidance for agents

- Confirm before creating the App Engine app (its region is permanent),
  granting IAM roles, deploying, creating the Scheduler job and sending test
  emails. Each is a change to the user's cloud project or someone's inbox.
- Never run `gcloud auth login` yourself; ask the user to.
- Don't deploy over an existing `root-services` or `default` service that
  isn't the email service. Check `gcloud app services list` and, for an
  existing service, ask the user what it is.
- Don't guess recipients. Ask, and prefer group addresses.
