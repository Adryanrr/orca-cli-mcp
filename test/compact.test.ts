import { describe, expect, it } from 'vitest';
import { compactRepos, compactTerminals, compactWorktrees } from '../src/compact.js';

describe('compactWorktrees', () => {
  it('keeps the fields an agent needs and strips the ref prefix from branches', () => {
    const result = {
      worktrees: [
        {
          id: 'repo1::/w/app',
          repoId: 'repo1',
          path: '/w/app',
          branch: 'refs/heads/feat/x',
          displayName: 'feat/x',
          isMainWorktree: true,
          comment: '',
          linkedPR: null,
          linkedIssue: null,
          identity: { key: 'noise' },
          head: 'abc',
        },
      ],
      totalCount: 1,
    };
    expect(compactWorktrees(result)).toEqual({
      worktrees: [
        {
          id: 'repo1::/w/app',
          repoId: 'repo1',
          name: 'feat/x',
          branch: 'feat/x',
          path: '/w/app',
          isMain: true,
          comment: null,
          linkedPR: null,
          linkedIssue: null,
        },
      ],
      totalCount: 1,
    });
  });

  it('returns the input unchanged when the shape is unexpected', () => {
    expect(compactWorktrees({ other: 1 })).toEqual({ other: 1 });
  });
});

describe('compactTerminals', () => {
  it('keeps handle, worktree and title fields', () => {
    const result = {
      terminals: [
        {
          handle: 'term_1',
          worktreeId: 'repo1::/w/app',
          worktreePath: '/w/app',
          title: 'claude',
          ptyId: 'noise',
          incarnationId: 'noise',
          orphaned: false,
        },
      ],
    };
    expect(compactTerminals(result)).toEqual({
      terminals: [{ handle: 'term_1', title: 'claude', worktreeId: 'repo1::/w/app', worktreePath: '/w/app', orphaned: false }],
    });
  });
});

describe('compactRepos', () => {
  it('keeps id, name, path and kind', () => {
    const result = { repos: [{ id: 'r1', displayName: 'app', path: '/w/app', kind: 'git', badgeColor: '#fff' }] };
    expect(compactRepos(result)).toEqual({ repos: [{ id: 'r1', name: 'app', path: '/w/app', kind: 'git' }] });
  });
});
