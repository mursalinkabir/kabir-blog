import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum__site_v_version_nav" AS ENUM('home', 'tech', 'finance', 'japan', 'about', 'contact', 'projects', 'resume', 'now', 'uses', 'categories', 'tags');
  CREATE TYPE "public"."enum__site_v_version_nav_more" AS ENUM('home', 'tech', 'finance', 'japan', 'about', 'contact', 'projects', 'resume', 'now', 'uses', 'categories', 'tags');
  CREATE TABLE "_site_v_version_socials" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_site_v_version_nav" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__site_v_version_nav",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_site_v_version_nav_more" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum__site_v_version_nav_more",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "_site_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_email" varchar DEFAULT 'hello@smkabir.com' NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_site_v_locales" (
  	"version_name" varchar NOT NULL,
  	"version_tagline" varchar NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_now_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_now_v_locales" (
  	"version_content" jsonb,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_uses_v_version_groups_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_uses_v_version_groups_items_locales" (
  	"name" varchar,
  	"note" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_uses_v_version_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_uses_v_version_groups_locales" (
  	"title" varchar,
  	"id" serial PRIMARY KEY NOT NULL,
  	"_locale" "_locales" NOT NULL,
  	"_parent_id" integer NOT NULL
  );
  
  CREATE TABLE "_uses_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "_resume_v_version_basics_profiles" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"network" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_work_highlights" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_work" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"position" varchar NOT NULL,
  	"start_date" varchar NOT NULL,
  	"end_date" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_education" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"institution" varchar NOT NULL,
  	"area" varchar NOT NULL,
  	"study_type" varchar NOT NULL,
  	"start_date" varchar NOT NULL,
  	"end_date" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_skills_keywords" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_skills" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_projects" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"url" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_languages" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"language" varchar NOT NULL,
  	"spoken" varchar NOT NULL,
  	"reading" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v_version_certificates" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"issuer" varchar NOT NULL,
  	"date" varchar NOT NULL,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_resume_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"version_basics_name" varchar NOT NULL,
  	"version_basics_label" varchar NOT NULL,
  	"version_basics_email" varchar DEFAULT 'hello@smkabir.com' NOT NULL,
  	"version_basics_url" varchar DEFAULT 'https://smkabir.com',
  	"version_basics_summary" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "agent_log" ADD COLUMN "collection" varchar;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_pages" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_get_page" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_save_page" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_check_page" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_publish_page" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_unpublish_page" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_projects" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_get_project" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_save_project" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_check_project" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_publish_project" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_unpublish_project" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_tags" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_tag" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_categories" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_category_name" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_list_media" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_media" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_get_global" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_now" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_uses" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_resume" boolean DEFAULT true;
  ALTER TABLE "payload_mcp_api_keys" ADD COLUMN "payload_mcp_tool_update_site" boolean DEFAULT true;
  ALTER TABLE "_site_v_version_socials" ADD CONSTRAINT "_site_v_version_socials_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_v_version_nav" ADD CONSTRAINT "_site_v_version_nav_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_v_version_nav_more" ADD CONSTRAINT "_site_v_version_nav_more_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_site_v_locales" ADD CONSTRAINT "_site_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_site_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_now_v_locales" ADD CONSTRAINT "_now_v_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_now_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_uses_v_version_groups_items" ADD CONSTRAINT "_uses_v_version_groups_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_uses_v_version_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_uses_v_version_groups_items_locales" ADD CONSTRAINT "_uses_v_version_groups_items_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_uses_v_version_groups_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_uses_v_version_groups" ADD CONSTRAINT "_uses_v_version_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_uses_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_uses_v_version_groups_locales" ADD CONSTRAINT "_uses_v_version_groups_locales_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_uses_v_version_groups"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_basics_profiles" ADD CONSTRAINT "_resume_v_version_basics_profiles_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_work_highlights" ADD CONSTRAINT "_resume_v_version_work_highlights_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v_version_work"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_work" ADD CONSTRAINT "_resume_v_version_work_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_education" ADD CONSTRAINT "_resume_v_version_education_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_skills_keywords" ADD CONSTRAINT "_resume_v_version_skills_keywords_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v_version_skills"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_skills" ADD CONSTRAINT "_resume_v_version_skills_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_projects" ADD CONSTRAINT "_resume_v_version_projects_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_languages" ADD CONSTRAINT "_resume_v_version_languages_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_resume_v_version_certificates" ADD CONSTRAINT "_resume_v_version_certificates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_resume_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "_site_v_version_socials_order_idx" ON "_site_v_version_socials" USING btree ("_order");
  CREATE INDEX "_site_v_version_socials_parent_id_idx" ON "_site_v_version_socials" USING btree ("_parent_id");
  CREATE INDEX "_site_v_version_nav_order_idx" ON "_site_v_version_nav" USING btree ("order");
  CREATE INDEX "_site_v_version_nav_parent_idx" ON "_site_v_version_nav" USING btree ("parent_id");
  CREATE INDEX "_site_v_version_nav_more_order_idx" ON "_site_v_version_nav_more" USING btree ("order");
  CREATE INDEX "_site_v_version_nav_more_parent_idx" ON "_site_v_version_nav_more" USING btree ("parent_id");
  CREATE INDEX "_site_v_created_at_idx" ON "_site_v" USING btree ("created_at");
  CREATE INDEX "_site_v_updated_at_idx" ON "_site_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_site_v_locales_locale_parent_id_unique" ON "_site_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_now_v_created_at_idx" ON "_now_v" USING btree ("created_at");
  CREATE INDEX "_now_v_updated_at_idx" ON "_now_v" USING btree ("updated_at");
  CREATE UNIQUE INDEX "_now_v_locales_locale_parent_id_unique" ON "_now_v_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_uses_v_version_groups_items_order_idx" ON "_uses_v_version_groups_items" USING btree ("_order");
  CREATE INDEX "_uses_v_version_groups_items_parent_id_idx" ON "_uses_v_version_groups_items" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_uses_v_version_groups_items_locales_locale_parent_id_unique" ON "_uses_v_version_groups_items_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_uses_v_version_groups_order_idx" ON "_uses_v_version_groups" USING btree ("_order");
  CREATE INDEX "_uses_v_version_groups_parent_id_idx" ON "_uses_v_version_groups" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "_uses_v_version_groups_locales_locale_parent_id_unique" ON "_uses_v_version_groups_locales" USING btree ("_locale","_parent_id");
  CREATE INDEX "_uses_v_created_at_idx" ON "_uses_v" USING btree ("created_at");
  CREATE INDEX "_uses_v_updated_at_idx" ON "_uses_v" USING btree ("updated_at");
  CREATE INDEX "_resume_v_version_basics_profiles_order_idx" ON "_resume_v_version_basics_profiles" USING btree ("_order");
  CREATE INDEX "_resume_v_version_basics_profiles_parent_id_idx" ON "_resume_v_version_basics_profiles" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_work_highlights_order_idx" ON "_resume_v_version_work_highlights" USING btree ("_order");
  CREATE INDEX "_resume_v_version_work_highlights_parent_id_idx" ON "_resume_v_version_work_highlights" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_work_order_idx" ON "_resume_v_version_work" USING btree ("_order");
  CREATE INDEX "_resume_v_version_work_parent_id_idx" ON "_resume_v_version_work" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_education_order_idx" ON "_resume_v_version_education" USING btree ("_order");
  CREATE INDEX "_resume_v_version_education_parent_id_idx" ON "_resume_v_version_education" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_skills_keywords_order_idx" ON "_resume_v_version_skills_keywords" USING btree ("_order");
  CREATE INDEX "_resume_v_version_skills_keywords_parent_id_idx" ON "_resume_v_version_skills_keywords" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_skills_order_idx" ON "_resume_v_version_skills" USING btree ("_order");
  CREATE INDEX "_resume_v_version_skills_parent_id_idx" ON "_resume_v_version_skills" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_projects_order_idx" ON "_resume_v_version_projects" USING btree ("_order");
  CREATE INDEX "_resume_v_version_projects_parent_id_idx" ON "_resume_v_version_projects" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_languages_order_idx" ON "_resume_v_version_languages" USING btree ("_order");
  CREATE INDEX "_resume_v_version_languages_parent_id_idx" ON "_resume_v_version_languages" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_version_certificates_order_idx" ON "_resume_v_version_certificates" USING btree ("_order");
  CREATE INDEX "_resume_v_version_certificates_parent_id_idx" ON "_resume_v_version_certificates" USING btree ("_parent_id");
  CREATE INDEX "_resume_v_created_at_idx" ON "_resume_v" USING btree ("created_at");
  CREATE INDEX "_resume_v_updated_at_idx" ON "_resume_v" USING btree ("updated_at");
  CREATE INDEX "agent_log_collection_idx" ON "agent_log" USING btree ("collection");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "_site_v_version_socials" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_site_v_version_nav" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_site_v_version_nav_more" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_site_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_site_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_now_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_now_v_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_uses_v_version_groups_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_uses_v_version_groups_items_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_uses_v_version_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_uses_v_version_groups_locales" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_uses_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_basics_profiles" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_work_highlights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_work" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_education" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_skills_keywords" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_skills" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_projects" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v_version_certificates" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_resume_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "_site_v_version_socials" CASCADE;
  DROP TABLE "_site_v_version_nav" CASCADE;
  DROP TABLE "_site_v_version_nav_more" CASCADE;
  DROP TABLE "_site_v" CASCADE;
  DROP TABLE "_site_v_locales" CASCADE;
  DROP TABLE "_now_v" CASCADE;
  DROP TABLE "_now_v_locales" CASCADE;
  DROP TABLE "_uses_v_version_groups_items" CASCADE;
  DROP TABLE "_uses_v_version_groups_items_locales" CASCADE;
  DROP TABLE "_uses_v_version_groups" CASCADE;
  DROP TABLE "_uses_v_version_groups_locales" CASCADE;
  DROP TABLE "_uses_v" CASCADE;
  DROP TABLE "_resume_v_version_basics_profiles" CASCADE;
  DROP TABLE "_resume_v_version_work_highlights" CASCADE;
  DROP TABLE "_resume_v_version_work" CASCADE;
  DROP TABLE "_resume_v_version_education" CASCADE;
  DROP TABLE "_resume_v_version_skills_keywords" CASCADE;
  DROP TABLE "_resume_v_version_skills" CASCADE;
  DROP TABLE "_resume_v_version_projects" CASCADE;
  DROP TABLE "_resume_v_version_languages" CASCADE;
  DROP TABLE "_resume_v_version_certificates" CASCADE;
  DROP TABLE "_resume_v" CASCADE;
  DROP INDEX "agent_log_collection_idx";
  ALTER TABLE "agent_log" DROP COLUMN "collection";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_pages";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_get_page";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_save_page";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_check_page";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_publish_page";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_unpublish_page";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_projects";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_get_project";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_save_project";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_check_project";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_publish_project";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_unpublish_project";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_tags";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_tag";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_categories";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_category_name";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_list_media";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_media";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_get_global";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_now";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_uses";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_resume";
  ALTER TABLE "payload_mcp_api_keys" DROP COLUMN "payload_mcp_tool_update_site";
  DROP TYPE "public"."enum__site_v_version_nav";
  DROP TYPE "public"."enum__site_v_version_nav_more";`)
}
