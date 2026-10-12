import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "uses_groups_items_locales" ALTER COLUMN "name" DROP NOT NULL;
  ALTER TABLE "uses_groups_locales" ALTER COLUMN "title" DROP NOT NULL;`);
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "uses_groups_items_locales" ALTER COLUMN "name" SET NOT NULL;
  ALTER TABLE "uses_groups_locales" ALTER COLUMN "title" SET NOT NULL;`);
}
