import { pool } from '../db/client.js';

/**
 * Check if user is a workspace admin
 */
export async function isWorkspaceAdmin(userId: string, workspaceId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2',
    [workspaceId, userId]
  );
  return result.rows[0]?.role === 'admin';
}

/**
 * Get visibility filter context for SQL queries.
 * Returns the isAdmin boolean that should be used with visibility filter SQL.
 * If authMiddleware already loaded the workspace role, pass it here to avoid
 * repeating the membership lookup for the same request.
 *
 * The visibility filter pattern is:
 *   (visibility = 'workspace' OR created_by = $userId OR $isAdmin = TRUE)
 *
 * This allows:
 * - All workspace-visible documents to be seen by everyone
 * - Private documents to be seen only by their creator
 * - Admins to see all documents
 */
export async function getVisibilityContext(
  userId: string,
  workspaceId: string,
  workspaceRole?: string | null,
  isSuperAdmin = false
): Promise<{ isAdmin: boolean }> {
  if (isSuperAdmin || workspaceRole === 'admin') {
    return { isAdmin: true };
  }

  if (workspaceRole) {
    return { isAdmin: false };
  }

  const isAdmin = await isWorkspaceAdmin(userId, workspaceId);
  return { isAdmin };
}

/**
 * SQL fragment for visibility filtering.
 * Use with parameterized queries where:
 * - $N is userId
 * - $N+1 is isAdmin boolean
 *
 * Example:
 *   const { isAdmin } = await getVisibilityContext(userId, workspaceId);
 *   const query = `
 *     SELECT * FROM documents d
 *     WHERE d.workspace_id = $1
 *       AND ${VISIBILITY_FILTER_SQL('d', '$2', '$3')}
 *   `;
 *   await pool.query(query, [workspaceId, userId, isAdmin]);
 */
export function VISIBILITY_FILTER_SQL(
  tableAlias: string,
  userIdParam: string,
  isAdminParam: string
): string {
  return `(${tableAlias}.visibility = 'workspace' OR ${tableAlias}.created_by = ${userIdParam} OR ${isAdminParam} = TRUE)`;
}
