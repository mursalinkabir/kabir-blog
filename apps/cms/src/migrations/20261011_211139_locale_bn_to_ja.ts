import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/*
 * The second language changed from Bengali (bn) to Japanese (ja).
 *
 * Payload's generated diff drops and recreates the locale enum with a USING cast, which fails as soon as any row
 * still says 'bn'. This hand-written version is safe on a database that has content:
 *   1. Bengali rows are deleted (they are not Japanese, and relabelling them would put Bengali text on /ja/ pages);
 *   2. the enum value is renamed in place, so every English row, relationship and version is untouched.
 * Nothing was ever deployed with Bengali, so in practice step 1 only clears local development data.
 */
const LOCALE_TABLES = [
  'media_locales',
  'categories_locales',
  'tags_locales',
  'posts_locales',
  '_posts_v_locales',
  'projects_locales',
  '_projects_v_locales',
  'pages_locales',
  '_pages_v_locales',
  'site_locales',
  'now_locales',
  'uses_groups_items_locales',
  'uses_groups_locales',
]

const VERSION_TABLES = ['_posts_v', '_projects_v', '_pages_v']

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of LOCALE_TABLES) {
    await db.execute(sql.raw(`DELETE FROM "${table}" WHERE "_locale" = 'bn';`))
  }
  for (const table of VERSION_TABLES) {
    await db.execute(sql.raw(`UPDATE "${table}" SET "published_locale" = NULL WHERE "published_locale" = 'bn';`))
  }
  await db.execute(sql`
    ALTER TYPE "public"."_locales" RENAME VALUE 'bn' TO 'ja';
    ALTER TYPE "public"."enum__posts_v_published_locale" RENAME VALUE 'bn' TO 'ja';
    ALTER TYPE "public"."enum__projects_v_published_locale" RENAME VALUE 'bn' TO 'ja';
    ALTER TYPE "public"."enum__pages_v_published_locale" RENAME VALUE 'bn' TO 'ja';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TYPE "public"."_locales" RENAME VALUE 'ja' TO 'bn';
    ALTER TYPE "public"."enum__posts_v_published_locale" RENAME VALUE 'ja' TO 'bn';
    ALTER TYPE "public"."enum__projects_v_published_locale" RENAME VALUE 'ja' TO 'bn';
    ALTER TYPE "public"."enum__pages_v_published_locale" RENAME VALUE 'ja' TO 'bn';`)
}
