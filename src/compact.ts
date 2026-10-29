type Row = Record<string, unknown>;

const listOf = (result: unknown, key: string): Row[] | undefined => {
  if (!result || typeof result !== 'object') return undefined;
  const value = (result as Row)[key];
  return Array.isArray(value) ? (value as Row[]) : undefined;
};

/** Replaces one list in the result with a mapped copy; unknown shapes pass through untouched. */
const mapList = (result: unknown, key: string, map: (row: Row) => Row): unknown => {
  const rows = listOf(result, key);
  return rows ? { ...(result as Row), [key]: rows.map(map) } : result;
};

const stripRef = (branch: unknown): unknown =>
  typeof branch === 'string' ? branch.replace(/^refs\/heads\//, '') : branch;

export const compactWorktrees = (result: unknown): unknown =>
  mapList(result, 'worktrees', (w) => ({
    id: w.id,
    repoId: w.repoId,
    name: w.displayName,
    branch: stripRef(w.branch),
    path: w.path,
    isMain: w.isMainWorktree,
    comment: w.comment || null,
    linkedPR: w.linkedPR ?? null,
    linkedIssue: w.linkedIssue ?? null,
  }));

export const compactTerminals = (result: unknown): unknown =>
  mapList(result, 'terminals', (t) => ({
    handle: t.handle,
    title: t.title,
    worktreeId: t.worktreeId,
    worktreePath: t.worktreePath,
    orphaned: t.orphaned,
  }));

export const compactRepos = (result: unknown): unknown =>
  mapList(result, 'repos', (r) => ({ id: r.id, name: r.displayName, path: r.path, kind: r.kind }));
