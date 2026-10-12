import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres';

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_agent_log_outcome" AS ENUM('ok', 'refused', 'error');
  ALTER TYPE "public"."enum_users_role" ADD VALUE 'agent';
  CREATE TABLE "agent_log" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"tool" varchar NOT NULL,
  	"outcome" "enum_agent_log_outcome" NOT NULL,
  	"user_id" numeric,
  	"post_id" numeric,
  	"locale" varchar,
  	"summary" varchar,
  	"detail" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_mcp_api_keys" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"label" varchar,
  	"description" varchar,
  	"payload_mcp_tool_site_guide" boolean DEFAULT true,
  	"payload_mcp_tool_list_posts" boolean DEFAULT true,
  	"payload_mcp_tool_get_post" boolean DEFAULT true,
  	"payload_mcp_tool_create_draft" boolean DEFAULT true,
  	"payload_mcp_tool_update_draft" boolean DEFAULT true,
  	"payload_mcp_tool_upload_image" boolean DEFAULT true,
  	"payload_mcp_tool_check_post" boolean DEFAULT true,
  	"payload_mcp_tool_publish_post" boolean DEFAULT true,
  	"payload_mcp_tool_unpublish_post" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  ALTER TABLE "posts" ADD COLUMN "created_by_agent" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_created_by_agent" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "agent_log_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "payload_mcp_api_keys_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "payload_mcp_api_keys_id" integer;
  ALTER TABLE "payload_mcp_api_keys" ADD CONSTRAINT "payload_mcp_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "agent_log_tool_idx" ON "agent_log" USING btree ("tool");
  CREATE INDEX "agent_log_outcome_idx" ON "agent_log" USING btree ("outcome");
  CREATE INDEX "agent_log_post_id_idx" ON "agent_log" USING btree ("post_id");
  CREATE INDEX "agent_log_updated_at_idx" ON "agent_log" USING btree ("updated_at");
  CREATE INDEX "agent_log_created_at_idx" ON "agent_log" USING btree ("created_at");
  CREATE INDEX "payload_mcp_api_keys_user_idx" ON "payload_mcp_api_keys" USING btree ("user_id");
  CREATE INDEX "payload_mcp_api_keys_updated_at_idx" ON "payload_mcp_api_keys" USING btree ("updated_at");
  CREATE INDEX "payload_mcp_api_keys_created_at_idx" ON "payload_mcp_api_keys" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_agent_log_fk" FOREIGN KEY ("agent_log_id") REFERENCES "public"."agent_log"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_payload_mcp_api_keys_fk" FOREIGN KEY ("payload_mcp_api_keys_id") REFERENCES "public"."payload_mcp_api_keys"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_created_by_agent_idx" ON "posts" USING btree ("created_by_agent");
  CREATE INDEX "_posts_v_version_version_created_by_agent_idx" ON "_posts_v" USING btree ("version_created_by_agent");
  CREATE INDEX "payload_locked_documents_rels_agent_log_id_idx" ON "payload_locked_documents_rels" USING btree ("agent_log_id");
  CREATE INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx" ON "payload_locked_documents_rels" USING btree ("payload_mcp_api_keys_id");
  CREATE INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx" ON "payload_preferences_rels" USING btree ("payload_mcp_api_keys_id");`);
}

// `DROP TABLE ... CASCADE` above already removes the foreign keys that point at the dropped tables, so the generated
// `DROP CONSTRAINT` statements failed ("does not exist") and made `migrate:down` abort. IF EXISTS makes it rollback-safe.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "agent_log" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_mcp_api_keys" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "agent_log" CASCADE;
  DROP TABLE "payload_mcp_api_keys" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_agent_log_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_payload_mcp_api_keys_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT IF EXISTS "payload_preferences_rels_payload_mcp_api_keys_fk";
  
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'reader'::text;
  DROP TYPE "public"."enum_users_role";
  CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'reader');
  ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'reader'::"public"."enum_users_role";
  ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE "public"."enum_users_role" USING "role"::"public"."enum_users_role";
  DROP INDEX "posts_created_by_agent_idx";
  DROP INDEX "_posts_v_version_version_created_by_agent_idx";
  DROP INDEX "payload_locked_documents_rels_agent_log_id_idx";
  DROP INDEX "payload_locked_documents_rels_payload_mcp_api_keys_id_idx";
  DROP INDEX "payload_preferences_rels_payload_mcp_api_keys_id_idx";
  ALTER TABLE "posts" DROP COLUMN "created_by_agent";
  ALTER TABLE "_posts_v" DROP COLUMN "version_created_by_agent";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "agent_log_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "payload_mcp_api_keys_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "payload_mcp_api_keys_id";
  DROP TYPE "public"."enum_agent_log_outcome";`);
}
