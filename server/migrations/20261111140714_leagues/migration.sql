CREATE TABLE `leaderboard_choices` (
	`user_id` text PRIMARY KEY NOT NULL,
	`visible` integer NOT NULL,
	`chosen_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `league_closes` (
	`week` text PRIMARY KEY,
	`closed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `league_weeks` (
	`user_id` text NOT NULL,
	`week` text NOT NULL,
	`league` text NOT NULL,
	`cohort` integer NOT NULL,
	`points` integer,
	`rank` integer,
	`move` text,
	CONSTRAINT `league_weeks_pk` PRIMARY KEY(`user_id`, `week`)
);
--> statement-breakpoint
CREATE INDEX `league_weeks_board` ON `league_weeks` (`week`,`league`,`cohort`);