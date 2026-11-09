CREATE TABLE `challenge_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`days` integer NOT NULL,
	`daily_total` integer NOT NULL,
	`restart_on_miss` integer NOT NULL,
	`plan` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_challenge_versions_challenge_id_challenges_id_fk` FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`)
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`visibility` text NOT NULL,
	`current_version_id` text NOT NULL,
	`retired_at` integer,
	CONSTRAINT "challenges_visibility" CHECK("visibility" in ('private', 'public'))
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`tries` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge_id` text NOT NULL,
	`pinned_version_id` text,
	`group_challenge_id` text,
	`started_on` text NOT NULL,
	`ended_on` text,
	`end_reason` text,
	CONSTRAINT `fk_runs_challenge_id_challenges_id_fk` FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`),
	CONSTRAINT `fk_runs_pinned_version_id_challenge_versions_id_fk` FOREIGN KEY (`pinned_version_id`) REFERENCES `challenge_versions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_id` text NOT NULL,
	`plan_step` integer NOT NULL,
	`exercise` text NOT NULL,
	`goal` text NOT NULL,
	`reps` integer NOT NULL,
	`no_reps` integer NOT NULL,
	`held_ms` integer NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`counter_version` text NOT NULL,
	`attempts` text NOT NULL,
	`metrics` text,
	CONSTRAINT `fk_sets_workout_id_workouts_id_fk` FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `streak_events` (
	`id` text PRIMARY KEY NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT "streak_events_kind" CHECK("kind" in ('earned', 'used'))
);
--> statement-breakpoint
CREATE TABLE `sync_cursors` (
	`stream` text PRIMARY KEY NOT NULL,
	`cursor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text,
	`version_id` text,
	`day` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`tz_offset_min` integer NOT NULL,
	`tz` text NOT NULL,
	`app_version` text NOT NULL,
	CONSTRAINT `fk_workouts_run_id_runs_id_fk` FOREIGN KEY (`run_id`) REFERENCES `runs`(`id`),
	CONSTRAINT `fk_workouts_version_id_challenge_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `challenge_versions`(`id`),
	CONSTRAINT "workouts_status" CHECK("status" in ('open', 'done'))
);
--> statement-breakpoint
CREATE INDEX `challenge_versions_challenge` ON `challenge_versions` (`challenge_id`);--> statement-breakpoint
CREATE INDEX `runs_challenge` ON `runs` (`challenge_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sets_workout_step` ON `sets` (`workout_id`,`plan_step`);--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_one_open` ON `workouts` (`status`) WHERE "workouts"."status" = 'open';--> statement-breakpoint
CREATE INDEX `workouts_run_day` ON `workouts` (`run_id`,`day`);--> statement-breakpoint
CREATE INDEX `workouts_day` ON `workouts` (`day`);