CREATE TABLE `carrier_schedules` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`outbound_date` text,
	`outbound_time` text,
	`return_date` text,
	`return_time` text
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`event_date` text NOT NULL,
	`month_label` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`editor_name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participant_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`participant_id` integer NOT NULL,
	`role_id` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	`name` text NOT NULL,
	`is_absent` integer NOT NULL,
	`sendan_tea_count` integer NOT NULL,
	`transport_type` text NOT NULL,
	`ride_driver_participant_id` integer,
	`outbound_shuttle_id` integer,
	`return_shuttle_id` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shuttle_options` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`direction` text NOT NULL,
	`name` text NOT NULL,
	`capacity` integer,
	`note` text,
	`sort_order` integer NOT NULL,
	`is_active` integer NOT NULL
);
