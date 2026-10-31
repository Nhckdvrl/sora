CREATE TABLE `quota_buckets` (
  `bucket` text PRIMARY KEY NOT NULL,
  `n` integer NOT NULL DEFAULT 0,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `speech_uses` (
  `id` text PRIMARY KEY NOT NULL,
  `expires_at` integer NOT NULL
);
