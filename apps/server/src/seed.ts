import { db, organizations, workspaces, documents } from '@pulse/db';
import { eq } from 'drizzle-orm';

export const DEMO_DOC_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_ORG_ID = '00000000-0000-0000-0000-000000000010';
const DEMO_WORKSPACE_ID = '00000000-0000-0000-0000-000000000100';

export async function ensureDemoDocExists() {
  const existing = await db.query.documents.findFirst({
    where: eq(documents.id, DEMO_DOC_ID),
  });

  if (existing) return existing;

  await db
    .insert(organizations)
    .values({ id: DEMO_ORG_ID, name: 'Acme Corp', slug: 'acme-corp' })
    .onConflictDoNothing();

  await db
    .insert(workspaces)
    .values({ id: DEMO_WORKSPACE_ID, orgId: DEMO_ORG_ID, name: 'Product Engineering' })
    .onConflictDoNothing();

  const [doc] = await db
    .insert(documents)
    .values({
      id: DEMO_DOC_ID,
      workspaceId: DEMO_WORKSPACE_ID,
      title: 'Q4 Architecture RFC',
    })
    .onConflictDoNothing()
    .returning();

  return doc;
}