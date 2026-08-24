CREATE TYPE "public"."agent_status" AS ENUM('ACTIVE', 'FROZEN');--> statement-breakpoint
CREATE TYPE "public"."authorization_status" AS ENUM('initiated', 'confirmed', 'rejected', 'expired', 'completed');--> statement-breakpoint
CREATE TYPE "public"."decision_outcome" AS ENUM('ADMIT', 'ESCALATE', 'REFUSE');--> statement-breakpoint
CREATE TYPE "public"."decision_source" AS ENUM('mcp', 'http', 'llm', 'harness');--> statement-breakpoint
CREATE TYPE "public"."ledger_entry_type" AS ENUM('RESERVE', 'COMMIT', 'RELEASE');--> statement-breakpoint
CREATE TYPE "public"."misquote_kind" AS ENUM('CLAIMED_TOTAL_MISMATCH', 'UNKNOWN_DISCOUNT_CODE', 'TOKEN_TAMPERED', 'TOKEN_EXPIRED', 'TOKEN_WRONG_AGENT', 'TOKEN_REPLAYED');--> statement-breakpoint
CREATE TYPE "public"."order_state" AS ENUM('ADMITTED', 'AWAITING_AUTHORIZATION', 'ESCALATED', 'PAID', 'FAILED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text,
	"order_id" text,
	"event_type" text NOT NULL,
	"actor" text NOT NULL,
	"payload" jsonb NOT NULL,
	"prev_hash" text NOT NULL,
	"row_hash" text NOT NULL,
	"seq" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorization_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"authorization_id" text NOT NULL,
	"order_id" text,
	"reservation_id" text NOT NULL,
	"entry_type" "ledger_entry_type" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"merchant_id" text NOT NULL,
	"token_type" text DEFAULT 'single_block_multiple_debit' NOT NULL,
	"frequency" text DEFAULT 'as_presented' NOT NULL,
	"max_amount_paise" bigint NOT NULL,
	"expire_at" timestamp with time zone NOT NULL,
	"status" "authorization_status" DEFAULT 'confirmed' NOT NULL,
	"allowed_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"allowed_skus" text[] DEFAULT '{}'::text[] NOT NULL,
	"max_per_order_paise" bigint NOT NULL,
	"max_orders_per_hour" integer DEFAULT 10 NOT NULL,
	"granted_by" text NOT NULL,
	"granted_via" text NOT NULL,
	"grant_evidence" jsonb,
	"grant_signature" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"principal_ref" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"status" "agent_status" DEFAULT 'ACTIVE' NOT NULL,
	"frozen_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_items" (
	"sku" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"category" text NOT NULL,
	"list_price_paise" bigint NOT NULL,
	"inventory" integer DEFAULT 0 NOT NULL,
	"promo_text" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"order_id" text,
	"offer_id" text,
	"authorization_id" text,
	"outcome" "decision_outcome" NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"matched_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"escalatable" boolean DEFAULT false NOT NULL,
	"policy_version" integer DEFAULT 1 NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"authorization_balance_before_paise" bigint,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"engine_version" text NOT NULL,
	"source" "decision_source" NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text NOT NULL,
	"razorpay_key_id" text NOT NULL,
	"signing_key_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "misquote_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"offer_id" text,
	"decision_id" text,
	"kind" "misquote_kind" NOT NULL,
	"claimed_paise" bigint,
	"signed_paise" bigint,
	"claimed_discount_code" text,
	"raw_agent_text" text,
	"source" "decision_source" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" text PRIMARY KEY NOT NULL,
	"merchant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"authorization_id" text NOT NULL,
	"sku" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_paise" bigint NOT NULL,
	"total_paise" bigint NOT NULL,
	"currency" text DEFAULT 'INR' NOT NULL,
	"nonce" text NOT NULL,
	"token" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"authorization_id" text NOT NULL,
	"offer_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"state" "order_state" DEFAULT 'ADMITTED' NOT NULL,
	"razorpay_order_id" text,
	"razorpay_payment_link_id" text,
	"razorpay_payment_id" text,
	"authorization_url" text,
	"failure_reason" text,
	"settled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"body" text NOT NULL,
	"body_hash" text NOT NULL,
	"block_hashes" jsonb NOT NULL,
	"signature" text NOT NULL,
	"key_id" text NOT NULL,
	"chain_seq_from" bigint,
	"chain_seq_to" bigint,
	"chain_head_hash" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"razorpay_event_id" text NOT NULL,
	"event" text NOT NULL,
	"raw_body" text NOT NULL,
	"raw_body_sha256" text NOT NULL,
	"signature_header" text,
	"signature_verified" boolean NOT NULL,
	"order_id" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "authorization_ledger" ADD CONSTRAINT "authorization_ledger_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_agent_id_buyer_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."buyer_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authorizations" ADD CONSTRAINT "authorizations_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_agent_id_buyer_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."buyer_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misquote_events" ADD CONSTRAINT "misquote_events_agent_id_buyer_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."buyer_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_merchant_id_merchants_id_fk" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_agent_id_buyer_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."buyer_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_sku_catalog_items_sku_fk" FOREIGN KEY ("sku") REFERENCES "public"."catalog_items"("sku") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_agent_id_buyer_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."buyer_agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_authorization_id_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_seq_unique" ON "audit_log" USING btree ("seq");--> statement-breakpoint
CREATE INDEX "audit_order_idx" ON "audit_log" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_auth_idx" ON "authorization_ledger" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "ledger_reservation_idx" ON "authorization_ledger" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "ledger_expires_idx" ON "authorization_ledger" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "auth_agent_status_idx" ON "authorizations" USING btree ("agent_id","status");--> statement-breakpoint
CREATE INDEX "auth_expire_idx" ON "authorizations" USING btree ("expire_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agents_api_key_unique" ON "buyer_agents" USING btree ("api_key_hash");--> statement-breakpoint
CREATE INDEX "catalog_merchant_active_idx" ON "catalog_items" USING btree ("merchant_id","active");--> statement-breakpoint
CREATE INDEX "decisions_created_idx" ON "decisions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "decisions_outcome_idx" ON "decisions" USING btree ("outcome");--> statement-breakpoint
CREATE INDEX "decisions_source_label_idx" ON "decisions" USING btree ("source","label");--> statement-breakpoint
CREATE INDEX "misquote_source_created_idx" ON "misquote_events" USING btree ("source","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_nonce_unique" ON "offers" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX "offers_agent_expiry_idx" ON "offers" USING btree ("agent_id","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_idempotency_unique" ON "orders" USING btree ("agent_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_offer_unique" ON "orders" USING btree ("offer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_rzp_payment_unique" ON "orders" USING btree ("razorpay_payment_id");--> statement-breakpoint
CREATE INDEX "orders_state_idx" ON "orders" USING btree ("state");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_order_unique" ON "receipts" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_event_unique" ON "webhook_events" USING btree ("razorpay_event_id");--> statement-breakpoint
CREATE INDEX "webhook_order_idx" ON "webhook_events" USING btree ("order_id");