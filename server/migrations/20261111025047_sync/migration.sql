CREATE TABLE `challenge_versions` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`days` integer NOT NULL,
	`daily_total` integer NOT NULL,
	`restart_on_miss` integer NOT NULL,
	`plan` text NOT NULL,
	`created_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT `challenge_versions_pk` PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `challenges` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`visibility` text NOT NULL,
	`current_version_id` text NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT `challenges_pk` PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `changes` (
	`seq` integer PRIMARY KEY AUTOINCREMENT,
	`user_id` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `runs` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`challenge_id` text NOT NULL,
	`pinned_version_id` text,
	`group_challenge_id` text,
	`started_on` text NOT NULL,
	`ended_on` text,
	`end_reason` text,
	`received_at` integer NOT NULL,
	CONSTRAINT `runs_pk` PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `sets` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
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
	`received_at` integer NOT NULL,
	CONSTRAINT `sets_pk` PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `streak_events` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`day` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT `streak_events_pk` PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`user_id` text NOT NULL,
	`id` text NOT NULL,
	`run_id` text,
	`version_id` text,
	`day` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`tz_offset_min` integer NOT NULL,
	`tz` text NOT NULL,
	`app_version` text NOT NULL,
	`received_at` integer NOT NULL,
	CONSTRAINT `workouts_pk` PRIMARY KEY(`user_id`, `id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `changes_row` ON `changes` (`user_id`,`entity`,`entity_id`);--> statement-breakpoint
CREATE INDEX `changes_pull` ON `changes` (`user_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `sets_workout_step` ON `sets` (`user_id`,`workout_id`,`plan_step`);