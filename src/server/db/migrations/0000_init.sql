CREATE TYPE "public"."ai_error_code" AS ENUM('TIMEOUT', 'PROVIDER', 'INVALID_OUTPUT', 'CAP', 'STALE');--> statement-breakpoint
CREATE TYPE "public"."ai_run_status" AS ENUM('PENDING', 'SUCCEEDED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('DRAFT', 'PUBLISHED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."grade_status" AS ENUM('DRAFT', 'RELEASED');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('INSTRUCTOR', 'TA', 'STUDENT');--> statement-breakpoint
CREATE TYPE "public"."regrade_status" AS ENUM('OPEN', 'ACCEPTED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."score_source" AS ENUM('AI', 'HUMAN', 'AI_EDITED');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_grading_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"course_id" uuid NOT NULL,
	"requested_by" text,
	"status" "ai_run_status" DEFAULT 'PENDING' NOT NULL,
	"error_code" "ai_error_code",
	"model" varchar(80) NOT NULL,
	"prompt_version" varchar(20) NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"raw_output" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"instructions" text DEFAULT '' NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"allow_late" boolean DEFAULT false NOT NULL,
	"status" "assignment_status" DEFAULT 'DRAFT' NOT NULL,
	"max_score" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_max_score_nonneg" CHECK ("assignment"."max_score" >= 0)
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"course_id" uuid,
	"action" varchar(64) NOT NULL,
	"entity_type" varchar(32) NOT NULL,
	"entity_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(1000),
	"join_code" varchar(12) NOT NULL,
	"ai_enabled" boolean DEFAULT true NOT NULL,
	"created_by" text NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "course_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "course_member" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "criterion_score" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_id" uuid NOT NULL,
	"criterion_id" uuid NOT NULL,
	"level_id" uuid,
	"points" integer DEFAULT 0 NOT NULL,
	"feedback" text DEFAULT '' NOT NULL,
	"source" "score_source" NOT NULL,
	"ai_confidence" real,
	"ai_evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "criterion_score_points_range" CHECK ("criterion_score"."points" between 0 and 100),
	CONSTRAINT "criterion_score_confidence_range" CHECK ("criterion_score"."ai_confidence" is null or "criterion_score"."ai_confidence" between 0 and 1)
);
--> statement-breakpoint
CREATE TABLE "grade" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"status" "grade_status" DEFAULT 'DRAFT' NOT NULL,
	"total_score" integer DEFAULT 0 NOT NULL,
	"overall_feedback" text DEFAULT '' NOT NULL,
	"graded_by" text,
	"released_by" text,
	"released_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grade_submission_id_unique" UNIQUE("submission_id"),
	CONSTRAINT "grade_total_score_nonneg" CHECK ("grade"."total_score" >= 0),
	CONSTRAINT "grade_version_positive" CHECK ("grade"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "regrade_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grade_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"criterion_id" uuid,
	"reason" text NOT NULL,
	"status" "regrade_status" DEFAULT 'OPEN' NOT NULL,
	"response" text,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "regrade_request_grade_id_unique" UNIQUE("grade_id")
);
--> statement-breakpoint
CREATE TABLE "rubric_criterion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(1000) DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rubric_level" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"criterion_id" uuid NOT NULL,
	"label" varchar(60) NOT NULL,
	"points" integer NOT NULL,
	"descriptor" varchar(1000) DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rubric_level_points_range" CHECK ("rubric_level"."points" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "submission" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"status" "submission_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"is_late" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "submission_word_count_nonneg" CHECK ("submission"."word_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grading_run" ADD CONSTRAINT "ai_grading_run_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grading_run" ADD CONSTRAINT "ai_grading_run_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_grading_run" ADD CONSTRAINT "ai_grading_run_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment" ADD CONSTRAINT "assignment_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_member" ADD CONSTRAINT "course_member_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_member" ADD CONSTRAINT "course_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_grade_id_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_criterion_id_rubric_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."rubric_criterion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "criterion_score" ADD CONSTRAINT "criterion_score_level_id_rubric_level_id_fk" FOREIGN KEY ("level_id") REFERENCES "public"."rubric_level"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_submission_id_submission_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submission"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_graded_by_user_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade" ADD CONSTRAINT "grade_released_by_user_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regrade_request" ADD CONSTRAINT "regrade_request_grade_id_grade_id_fk" FOREIGN KEY ("grade_id") REFERENCES "public"."grade"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regrade_request" ADD CONSTRAINT "regrade_request_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regrade_request" ADD CONSTRAINT "regrade_request_criterion_id_rubric_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."rubric_criterion"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regrade_request" ADD CONSTRAINT "regrade_request_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_criterion" ADD CONSTRAINT "rubric_criterion_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rubric_level" ADD CONSTRAINT "rubric_level_criterion_id_rubric_criterion_id_fk" FOREIGN KEY ("criterion_id") REFERENCES "public"."rubric_criterion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_assignment_id_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignment"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission" ADD CONSTRAINT "submission_student_id_user_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_run_submission_created_idx" ON "ai_grading_run" USING btree ("submission_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_run_status_started_idx" ON "ai_grading_run" USING btree ("status","started_at");--> statement-breakpoint
CREATE INDEX "ai_run_course_created_idx" ON "ai_grading_run" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_run_one_pending_per_submission_uq" ON "ai_grading_run" USING btree ("submission_id") WHERE "ai_grading_run"."status" = 'PENDING';--> statement-breakpoint
CREATE INDEX "assignment_course_id_idx" ON "assignment" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "audit_log_course_created_idx" ON "audit_log" USING btree ("course_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_member_course_user_uq" ON "course_member" USING btree ("course_id","user_id");--> statement-breakpoint
CREATE INDEX "course_member_user_id_idx" ON "course_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "criterion_score_grade_criterion_uq" ON "criterion_score" USING btree ("grade_id","criterion_id");--> statement-breakpoint
CREATE INDEX "grade_status_idx" ON "grade" USING btree ("status");--> statement-breakpoint
CREATE INDEX "regrade_request_status_idx" ON "regrade_request" USING btree ("status");--> statement-breakpoint
CREATE INDEX "rubric_criterion_assignment_id_idx" ON "rubric_criterion" USING btree ("assignment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rubric_level_criterion_points_uq" ON "rubric_level" USING btree ("criterion_id","points");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_assignment_student_uq" ON "submission" USING btree ("assignment_id","student_id");--> statement-breakpoint
CREATE INDEX "submission_assignment_status_idx" ON "submission" USING btree ("assignment_id","status");--> statement-breakpoint
CREATE INDEX "submission_student_id_idx" ON "submission" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");