import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  eventDate: text("event_date").notNull(),
  monthLabel: text("month_label").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const groups = sqliteTable("groups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  editorName: text("editor_name").notNull(),
});

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export const shuttleOptions = sqliteTable("shuttle_options", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  direction: text("direction", { enum: ["outbound", "return"] }).notNull(),
  name: text("name").notNull(),
  capacity: integer("capacity"),
  note: text("note"),
  sortOrder: integer("sort_order").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull(),
});

export const participants = sqliteTable("participants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull(),
  groupId: integer("group_id").notNull(),
  name: text("name").notNull(),
  isAbsent: integer("is_absent", { mode: "boolean" }).notNull(),
  sendanTeaCount: integer("sendan_tea_count").notNull(),
  transportType: text("transport_type", {
    enum: ["none", "driver", "passenger", "shuttle"],
  }).notNull(),
  rideDriverParticipantId: integer("ride_driver_participant_id"),
  outboundShuttleId: integer("outbound_shuttle_id"),
  returnShuttleId: integer("return_shuttle_id"),
  otherRoleText: text("other_role_text"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const participantRoles = sqliteTable("participant_roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id").notNull(),
  roleId: integer("role_id").notNull(),
});

export const carrierSchedules = sqliteTable("carrier_schedules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  participantId: integer("participant_id").notNull(),
  outboundDate: text("outbound_date"),
  outboundTime: text("outbound_time"),
  returnDate: text("return_date"),
  returnTime: text("return_time"),
});
