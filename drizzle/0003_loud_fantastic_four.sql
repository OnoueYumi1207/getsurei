CREATE INDEX `carrier_schedules_participant_idx` ON `carrier_schedules` (`participant_id`);--> statement-breakpoint
CREATE INDEX `participant_roles_participant_idx` ON `participant_roles` (`participant_id`);--> statement-breakpoint
CREATE INDEX `participants_event_idx` ON `participants` (`event_id`);