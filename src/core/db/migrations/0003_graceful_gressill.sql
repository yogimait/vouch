ALTER TABLE "orders" ADD COLUMN "expires_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_expires_idx" ON "orders" USING btree ("expires_at");