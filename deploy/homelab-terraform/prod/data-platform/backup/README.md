# pg-main backups to R2 (drafts)

`pg-main` has no backup today. It holds Zitadel, TraderBuddy and, from Phase 4, the CMS (`payload`). These drafts add
continuous WAL archiving plus a daily base backup to a Cloudflare R2 bucket in your existing account, through the
**Barman Cloud plugin**.

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
| `restore-test.snippet.yaml`    | illustrative     | applied by hand in a scratch namespace, then deleted     |

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
switchover. Do it at a quiet time and watch `kubectl cnpg status pg-main -n platform` (illustrative).

## Done means restored

A backup that has not been restored is a hope. After step 4, apply `restore-test.snippet.yaml` in a scratch namespace
(with its own copy of the ObjectStore and the `pg-backups-r2` Secret), confirm the `payload` database and its row
counts are there, then delete it. Record the date in `docs/deploy.md`.
