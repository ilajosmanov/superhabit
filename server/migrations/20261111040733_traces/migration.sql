CREATE TABLE `traces` (
	`user_id` text NOT NULL,
	`set_id` text NOT NULL,
	`write_id` text NOT NULL,
	`bytes` integer NOT NULL,
	`uploaded_at` integer NOT NULL,
	CONSTRAINT `traces_pk` PRIMARY KEY(`user_id`, `set_id`)
);
