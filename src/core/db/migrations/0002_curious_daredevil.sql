CREATE TYPE "public"."purchase_request_source" AS ENUM('REORDER', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."purchase_request_status" AS ENUM('OPEN', 'RUNNING', 'CLOSED');--> statement-breakpoint
CREATE TABLE "cupboard_items" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"on_hand" integer NOT NULL,
	"start_on_hand" integer NOT NULL,
	"reorder_level" integer NOT NULL,
	"usage_per_tick" integer DEFAULT 1 NOT NULL,
	"need" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"source" "purchase_request_source" NOT NULL,
	"cupboard_item_id" text,
	"raised_by" text NOT NULL,
	"need" text NOT NULL,
	"status" "purchase_request_status" DEFAULT 'OPEN' NOT NULL,
	"outcome" "decision_outcome",
	"decision_id" text,
	"order_id" text,
	"words" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "requests_status_idx" ON "purchase_requests" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "requests_open_item_unique" ON "purchase_requests" USING btree ("cupboard_item_id") WHERE status <> 'CLOSED';