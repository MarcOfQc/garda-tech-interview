CREATE TABLE `agent_qualifications` (
	`agent_id` text NOT NULL,
	`code` text NOT NULL,
	`expires_on` text NOT NULL,
	PRIMARY KEY(`agent_id`, `code`),
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code`) REFERENCES `qualifications`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`agent_id` text NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `assignments_agent_idx` ON `assignments` (`agent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_shift_agent_unique` ON `assignments` (`shift_id`,`agent_id`);--> statement-breakpoint
CREATE TABLE `qualifications` (
	`code` text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shift_requirements` (
	`shift_id` text NOT NULL,
	`code` text NOT NULL,
	PRIMARY KEY(`shift_id`, `code`),
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`code`) REFERENCES `qualifications`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`site` text NOT NULL,
	`start_at` integer NOT NULL,
	`end_at` integer NOT NULL,
	`headcount` integer NOT NULL,
	CONSTRAINT "shift_ends_after_start" CHECK("shifts"."end_at" > "shifts"."start_at"),
	CONSTRAINT "shift_headcount_positive" CHECK("shifts"."headcount" > 0)
);
--> statement-breakpoint
CREATE INDEX `shifts_window_idx` ON `shifts` (`start_at`,`end_at`);