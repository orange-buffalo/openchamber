import { beforeEach, describe, expect, test } from 'bun:test';
import { useUIStore } from './useUIStore';

beforeEach(() => {
  useUIStore.setState({ diffLayoutPreference: 'inline', diffFileLayout: {} });
});

describe('useUIStore diff layout', () => {
  test('new diff views default to side-by-side', () => {
    expect(useUIStore.getInitialState().diffLayoutPreference).toBe('side-by-side');
  });

  test('reopening Git restores tree and split defaults despite saved list and inline choices', () => {
    const store = useUIStore.getState();
    store.setDiffFileListMode('flat');
    store.setGitChangesViewMode('flat');
    store.setDiffFileLayout('a.ts', 'inline');

    store.resetGitViewDefaults();

    expect(useUIStore.getState().gitChangesViewMode).toBe('tree');
    expect(useUIStore.getState().diffFileListMode).toBe('tree');
    expect(useUIStore.getState().diffLayoutPreference).toBe('side-by-side');
    expect(useUIStore.getState().diffFileLayout).toEqual({});

    // Choices made while the view is open remain usable until the next open.
    store.setDiffFileListMode('flat');
    store.setDiffFileLayout('a.ts', 'inline');
    expect(useUIStore.getState().diffFileListMode).toBe('flat');
    expect(useUIStore.getState().diffFileLayout).toEqual({ 'a.ts': 'inline' });

    store.resetGitViewDefaults();
    expect(useUIStore.getState().diffFileListMode).toBe('tree');
    expect(useUIStore.getState().diffFileLayout).toEqual({});
  });

  test('the layout for all files becomes the setting and drops per-file choices', () => {
    const store = useUIStore.getState();
    store.setDiffFileLayout('a.ts', 'inline');
    store.setDiffFileLayout('b.ts', 'side-by-side');

    store.setDiffLayoutForAllFiles('side-by-side');

    expect(useUIStore.getState().diffLayoutPreference).toBe('side-by-side');
    expect(useUIStore.getState().diffFileLayout).toEqual({});
  });

  test('choosing the layout already set still drops the per-file choices that differ', () => {
    useUIStore.setState({ diffLayoutPreference: 'side-by-side' });
    useUIStore.getState().setDiffFileLayout('a.ts', 'inline');

    useUIStore.getState().setDiffLayoutForAllFiles('side-by-side');

    expect(useUIStore.getState().diffFileLayout).toEqual({});
  });

  test('the setting alone keeps per-file choices', () => {
    useUIStore.getState().setDiffFileLayout('a.ts', 'inline');

    useUIStore.getState().setDiffLayoutPreference('side-by-side');

    expect(useUIStore.getState().diffFileLayout).toEqual({ 'a.ts': 'inline' });
  });
});
