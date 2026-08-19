import type { Session } from "@opencode-ai/sdk/v2";

import { SessionGroupSection } from "@openchamber/ui/components/session/sidebar/SessionGroupSection";
import { SessionNodeItem } from "@openchamber/ui/components/session/sidebar/SessionNodeItem";
import { SidebarActivitySections } from "@openchamber/ui/components/session/sidebar/SidebarActivitySections";
import { SidebarProjectsList } from "@openchamber/ui/components/session/sidebar/SidebarProjectsList";
import type {
  SessionGroup,
  SessionNode,
} from "@openchamber/ui/components/session/sidebar/types";

// Deterministic sidebar content: three projects, one of which owns a worktree
// sub-group, plus a recent zone. Enough shape to show zone separation and
// worktree nesting without a server, credentials, or a model request.

const FIXED_TIME = 1_700_000_000_000;

const session = (id: string, title: string, directory: string): Session =>
  ({
    id,
    title,
    directory,
    projectID: directory,
    parentID: undefined,
    version: "1.0.0",
    time: { created: FIXED_TIME, updated: FIXED_TIME },
  }) as unknown as Session;

const node = (
  id: string,
  title: string,
  directory: string,
): SessionNode => ({
  session: session(id, title, directory),
  children: [],
  worktree: null,
});

const group = (
  overrides: Partial<SessionGroup> & Pick<SessionGroup, "id" | "label">,
): SessionGroup => ({
  branch: null,
  description: null,
  isMain: false,
  worktree: null,
  directory: null,
  sessions: [],
  ...overrides,
});

const RENALO = "/home/dev/renalo";
const AIONIFY = "/home/dev/aionify";
const AIONIFY_WORKTREE = "/home/dev/aionify-happy-mongoose";
const OPENCHAMBER = "/home/dev/openchamber";

const projectSections = [
  {
    project: {
      id: "renalo",
      label: "renalo",
      normalizedPath: RENALO,
      icon: "book-2",
    },
    groups: [
      group({
        id: "root",
        label: "renalo",
        isMain: true,
        directory: RENALO,
        folderScopeKey: RENALO,
        sessions: [node("ses_renalo_1", "Renalo releases", RENALO)],
      }),
    ],
  },
  {
    project: {
      id: "aionify",
      label: "aionify",
      normalizedPath: AIONIFY,
      icon: "compass-3",
    },
    groups: [
      group({
        id: "root",
        label: "aionify",
        isMain: true,
        directory: AIONIFY,
        folderScopeKey: AIONIFY,
        sessions: [],
      }),
      group({
        id: "worktree-happy-mongoose",
        label: "happy-mongoose",
        branch: "happy-mongoose",
        directory: AIONIFY_WORKTREE,
        folderScopeKey: AIONIFY_WORKTREE,
        sessions: [
          node(
            "ses_aionify_1",
            "macOS menu bar app options and tradeoffs",
            AIONIFY_WORKTREE,
          ),
        ],
      }),
    ],
  },
  {
    project: {
      id: "openchamber",
      label: "openchamber",
      normalizedPath: OPENCHAMBER,
      icon: "folder",
    },
    groups: [
      group({
        id: "root",
        label: "openchamber",
        isMain: true,
        directory: OPENCHAMBER,
        folderScopeKey: OPENCHAMBER,
        sessions: [
          node("ses_oc_1", "Fork build deployment for agents", OPENCHAMBER),
          node("ses_oc_2", "Projects panel separators", OPENCHAMBER),
        ],
      }),
    ],
  },
];

const recentItems = [
  {
    node: node("ses_oc_1", "Fork build deployment for agents", OPENCHAMBER),
    projectId: "openchamber",
    groupDirectory: OPENCHAMBER,
    secondaryMeta: null,
  },
  {
    node: node("ses_renalo_1", "Renalo releases", RENALO),
    projectId: "renalo",
    groupDirectory: RENALO,
    secondaryMeta: null,
  },
];

const EMPTY_STRING_SET: Set<string> = new Set();
const EMPTY_ORDER_INDEX: Map<string, number> = new Map();
const noop = () => {};

const renderSessionNode = (
  sessionNode: SessionNode,
  depth = 0,
  groupDirectory: string | null = null,
  projectId: string | null = null,
  archivedBucket = false,
  secondaryMeta: {
    projectLabel?: string | null;
    branchLabel?: string | null;
  } | null = null,
  renderContext: "project" | "recent" = "project",
): React.ReactNode => (
  <SessionNodeItem
    key={`${renderContext}:${sessionNode.session.id}`}
    node={sessionNode}
    depth={depth}
    groupDirectory={groupDirectory}
    projectId={projectId}
    archivedBucket={archivedBucket}
    pinnedSessionIds={EMPTY_STRING_SET}
    expandedParents={EMPTY_STRING_SET}
    hasSessionSearchQuery={false}
    normalizedSessionSearchQuery=""
    notifyOnSubtasks={false}
    editingId={null}
    setEditingId={noop}
    editTitle=""
    setEditTitle={noop}
    handleSaveEdit={noop}
    handleCancelEdit={noop}
    toggleParent={noop}
    handleSessionSelect={noop}
    handleSessionDoubleClick={noop}
    togglePinnedSession={noop}
    handleShareSession={noop}
    copiedSessionId={null}
    handleCopyShareUrl={noop}
    handleCopySessionId={noop}
    handleUnshareSession={noop}
    openSidebarMenuKey={null}
    setOpenSidebarMenuKey={noop}
    renamingFolderId={null}
    getFoldersForScope={() => []}
    getSessionFolderId={() => null}
    removeSessionFromFolder={noop}
    addSessionToFolder={noop}
    createFolderAndStartRename={() => null}
    openContextPanelTab={noop}
    handleDeleteSession={noop}
    handleRestoreSession={noop}
    mobileVariant={false}
    alwaysShowActions={false}
    renderSessionNode={renderSessionNode}
    secondaryMeta={secondaryMeta}
    renderContext={renderContext}
    subtreeContainsEditing={EMPTY_STRING_SET}
    menuOpenSessionId={null}
    nodeStructureKey={sessionNode.session.id}
  />
);

const renderGroupSessions = (
  sessionGroup: SessionGroup,
  groupKey: string,
  projectId?: string | null,
  hideGroupLabel?: boolean,
  dragHandleProps?: unknown,
  compactBodyPadding?: boolean,
): React.ReactNode => (
  <SessionGroupSection
    group={sessionGroup}
    groupKey={groupKey}
    projectId={projectId}
    hideGroupLabel={hideGroupLabel}
    hasSessionSearchQuery={false}
    normalizedSessionSearchQuery=""
    groupSearchDataByGroup={new WeakMap()}
    collapsedGroups={EMPTY_STRING_SET}
    hideDirectoryControls={false}
    collapsedFolderIds={EMPTY_STRING_SET}
    toggleFolderCollapse={noop}
    renameFolder={noop}
    deleteFolder={noop}
    showDeletionDialog={false}
    setDeleteFolderConfirm={noop}
    renderSessionNode={renderSessionNode}
    showMoreGroupSessions={noop}
    resetGroupSessionLimit={noop}
    mobileVariant={false}
    alwaysShowActions={false}
    activeProjectId={null}
    setActiveProjectIdOnly={noop}
    setActiveMainTab={noop}
    setSessionSwitcherOpen={noop}
    openNewSessionDraft={noop}
    addSessionToFolder={noop}
    createFolderAndStartRename={() => null}
    renamingFolderId={null}
    renameFolderDraft=""
    setRenameFolderDraft={noop}
    setRenamingFolderId={noop}
    pinnedSessionIds={EMPTY_STRING_SET}
    expandedParents={EMPTY_STRING_SET}
    sessionOrderIndex={EMPTY_ORDER_INDEX}
    editingId={null}
    editTitle=""
    openSidebarMenuKey={null}
    activeActivitySessionIds={EMPTY_STRING_SET}
    unreadActivitySessionIds={EMPTY_STRING_SET}
    notifyOnSubtasks={false}
    onToggleCollapsedGroup={noop}
    dragHandleProps={dragHandleProps as never}
    compactBodyPadding={compactBodyPadding}
  />
);

export function SidebarProjectsFixture(): React.ReactNode {
  return (
    <div className="flex h-[860px] w-[300px] flex-col bg-sidebar text-sidebar-foreground">
      <SidebarProjectsList
        topContent={
          <SidebarActivitySections
            sections={[
              { key: "active-now", title: "recent", items: recentItems },
            ]}
            renderSessionNode={renderSessionNode}
            editingId={null}
            openSidebarMenuKey={null}
            variant="section"
            isDesktopShellRuntime={false}
          />
        }
        sectionsForRender={projectSections}
        projectSections={projectSections}
        activeProjectId="openchamber"
        showOnlyMainWorkspace={false}
        hasSessionSearchQuery={false}
        emptyState={null}
        searchEmptyState={null}
        renderGroupSessions={renderGroupSessions}
        getOrderedGroups={(_projectId, groups) => groups}
        setGroupOrderByProject={noop}
        homeDirectory="/home/dev"
        collapsedProjects={EMPTY_STRING_SET}
        hideDirectoryControls={false}
        projectRepoStatus={new Map([["aionify", true]])}
        isDesktopShellRuntime={false}
        stickyZoneHeaders={false}
        stuckProjectHeaders={EMPTY_STRING_SET}
        mobileVariant={false}
        alwaysShowActions={false}
        projectSortOrder="manual"
        isInlineEditing={false}
        reorderProjects={noop}
        toggleProject={noop}
        setActiveProjectIdOnly={noop}
        setActiveMainTab={noop}
        setSessionSwitcherOpen={noop}
        openNewSessionDraft={noop}
        openNewWorktreeDialog={noop}
        openWorktreesPage={noop}
        openProjectEditDialog={noop}
        removeProject={noop}
        projectHeaderSentinelRefs={{ current: new Map() }}
        openSidebarMenuKey={null}
        setOpenSidebarMenuKey={noop}
      />
    </div>
  );
}
