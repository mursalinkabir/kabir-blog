# pg-main backups to R2 (drafts)

`pg-main` holds Zitadel, TraderBuddy and the CMS (`payload`). Continuous WAL archiving and daily base backups to
Cloudflare R2 were verified on 2026-10-17. The restore drill passed on 2026-11-26 JST. See
[deployment evidence](../../../../../docs/deploy.md#the-cms-service-phase-4).

**Why the plugin and not `spec.backup.barmanObjectStore`:** the in-tree integration still works in CNPG 1.30 but is
deprecated, and its removal is now planned for 1.31.0 (the 1.30.0 release notes moved it from 1.30.0). A new setup
should not start on it. Verified 2026-10-12 against the CNPG 1.30 docs and the plugin docs (v0.15.1).

Files here are drafts; nothing in this repo reads them. Snippets are marked production-ready or illustrative.

| File                           | Status           | Goes to (homelab-terraform/prod/data-platform/)          |
| ------------------------------ | ---------------- | -------------------------------------------------------- |
| `stage-plugin.sh`              | production-ready | writes `07-barman-cloud-plugin.yaml` (pinned by SHA-256) |
| `seal-pg-backups.sh`           | production-ready | writes `08-pg-backups-r2.sealed.yaml` (you run it)       |
| `objectstore.yaml`             | production-ready | `09-pg-main-objectstore.yaml`                            |
| `cluster-plugins.snippet.yaml` | illustrative     | two lines added to `03-cnpg-cluster.yaml` by hand        |
| `scheduled-backup.yaml`        | production-ready | `10-pg-main-scheduled-backup.yaml`                       |
| `restore-test.snippet.yaml`    | illustrative     | scratch namespace via GitOps, then removed               |

## Prerequisites (you)

1. R2 bucket `kabir-blog-pg-backups` (no public access, no custom domain).
2. An R2 API token: **Object Read & Write**, scoped to that one bucket. Keep the Access Key ID and Secret.

## Order, with what each step does to the running database

| Step | Commit                                           | Effect on `pg-main`                                    |
| ---- | ------------------------------------------------ | ------------------------------------------------------ |
| 1    | `07` plugin + `08` sealed credentials            | none; one new Deployment in `cnpg-system`              |
| 2    | `09` ObjectStore                                 | none; a custom resource nothing references yet         |
| 3    | `03` gains `spec.plugins` (illustrative snippet) | **rolling restart of the 3 instances, one switchover** |
| 4    | `10` ScheduledBackup (`immediate: true`)         | first base backup now, then daily; read load only      |

Step 3 is the only disruptive one: Zitadel and TraderBuddy see their connections drop once, for the length of a
switchover. Do it at a quiet time and watch the pods and the `ContinuousArchiving` condition (illustrative; the
`kubectl cnpg` plugin is optional and was not needed):

```
kubectl -n platform get pods -l cnpg.io/cluster=pg-main,cnpg.io/podRole=instance -o wide -w
kubectl -n platform get cluster pg-main -o jsonpath='{range .status.conditions[*]}{.type}={.status} ({.reason}){"\n"}{end}'
```

If a replica stays `Pending`, read `kubectl describe pod` first: the spread selectors in `03` must match instance pods
only (`cnpg.io/podRole: instance`), because the pooler pods carry `cnpg.io/cluster` as well.

## Restore drill

1. In `homelab-terraform`, stage [the restore draft](restore-test.snippet.yaml) in a dedicated scratch namespace.
   Match the source PostgreSQL major version and size the scratch volume for the full `pg-main` backup. Use a
   namespace-local ObjectStore pointed at the existing backup destination and a sealed, read-only R2 credential.
   Keep the recovery source's `serverName: pg-main` and leave WAL archiving disabled for the scratch cluster.
   Use a dedicated cluster for this production data. `pg-stg` is reserved for disposable test data.
   [Barman Cloud restore configuration](https://cloudnative-pg.io/plugin-barman-cloud/docs/0.15.1/usage/#restoring-a-cluster)
2. After Argo CD syncs, wait for the scratch cluster to become Ready. Confirm that the `payload` database and its
   expected tables exist. Compare counts for key CMS tables such as `posts`, `pages` and `media` against the expected
   counts at the recovery point.
3. Start a scratch Payload deployment using a connection to the restored database, a separate `PAYLOAD_SECRET`,
   and no public route or production media write credentials. Check `/readyz` and read a known restored CMS record
   through a private connection. Record the backup identifier, recovery time, counts and CMS check result in
   [the deployment evidence](../../../../../docs/deploy.md), without recording credentials or restored content.
4. Remove the scratch GitOps resources and verify the scratch workload, cluster, volumes and credentials are gone.
   Continue to the next cutover step once the recovery and CMS checks pass.
