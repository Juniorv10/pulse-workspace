import {
  pgTable, uuid, text, timestamp, boolean,
  jsonb, pgEnum, integer, customType, uniqueIndex
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; notNull: false; default: false }>({
  dataType() {
    return 'bytea';
  },
});

export const roleEnum = pgEnum('role', ['OWNER', 'ADMIN', 'MEMBER', 'GUEST']);
export const taskStatusEnum = pgEnum('task_status', ['BACKLOG', 'TODO', 'IN_PROGRESS', 'DONE']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memberships = pgTable('memberships', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  role: roleEnum('role').default('MEMBER').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  userOrgIdx: uniqueIndex('user_org_idx').on(table.userId, table.orgId),
}));

export const workspaces = pgTable('workspaces', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  isPrivate: boolean('is_private').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull().default('Untitled'),
  yjsState: bytea('yjs_state'),
  version: integer('version').default(1).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const tasks = pgTable('tasks', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  status: taskStatusEnum('status').default('TODO').notNull(),
  position: text('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const workflows = pgTable('workflows', {
  id: uuid('id').defaultRandom().primaryKey(),
  workspaceId: uuid('workspace_id').references(() => workspaces.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  triggerType: text('trigger_type').notNull(),
  graphDefinition: jsonb('graph_definition').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});