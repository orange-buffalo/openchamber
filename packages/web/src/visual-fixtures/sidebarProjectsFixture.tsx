import type { Session } from "@openchamber/ui/lib/opencode/model";

import { SessionProjectScroller } from "@openchamber/ui/components/session/sidebar/projects/SessionProjectScroller";
import { buildSessionSidebarRowModel } from "@openchamber/ui/components/session/sidebar/sessionSidebarRowModel";
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

export function SidebarProjectsFixture(): React.ReactNode {
  const rowModel = buildSessionSidebarRowModel({
    mode: 'normal',
    sections: projectSections,
    authoritativeSections: projectSections,
    chatGroup: null,
    recentSections: [{ key: 'active-now', items: recentItems }],
    showRecentSection: true,
    foldersMap: {},
    groupSearchDataByGroup: new WeakMap(),
    normalizedQuery: '',
    collapsedProjects: EMPTY_STRING_SET,
    collapsedGroups: EMPTY_STRING_SET,
    collapsedFolders: EMPTY_STRING_SET,
    collapsedActivities: EMPTY_STRING_SET,
    expandedParents: EMPTY_STRING_SET,
    visibleCountByContainer: new Map(),
    pinnedSessionIds: EMPTY_STRING_SET,
    sessionOrderIndex: EMPTY_ORDER_INDEX,
    groupStatusByKey: new Map(),
    folderAuthorityByOwner: new Map(),
    activeProjectId: 'openchamber',
    singleProjectMode: false,
    singleProjectId: null,
    showOnlyMainWorkspace: false,
    hideDirectoryControls: false,
  });
  const sessionTreeActions = {
    setEditingId: noop,
    setEditTitle: noop,
    toggleParent: noop,
    setOpenSidebarMenuKey: noop,
    allowReselect: false,
    isSessionSearchOpen: false,
    sessionSearchQuery: "",
    setSessionSearchQuery: noop,
    setIsSessionSearchOpen: noop,
    deleteSessionConfirm: null,
    setDeleteSessionConfirm: noop,
    startFolderRename: noop,
    setCopiedSessionId: noop,
    editingRowKey: null,
    setEditingRowKey: noop,
    onSessionSelected: noop,
    resetSessionSearch: noop,
    startSessionWorktreeMenuLoad: () => ({ cachedTargets: [], refreshTargets: Promise.resolve([]) }),
  };

  return (
    <div className="flex h-[860px] w-[300px] flex-col bg-sidebar text-sidebar-foreground">
      <SessionProjectScroller
        model={{
          rowModel,
          sectionsForRender: projectSections,
          projectSections,
          singleProjectMode: false,
          emptyState: null,
          searchEmptyState: null,
          projectRepoStatus: new Map([["aionify", true]]),
          state: {
            editingId: null,
            openSidebarMenuKey: null,
            setOpenSidebarMenuKey: noop,
            visibleSessionCountByGroup: new Map(),
            collapsedActivityKeys: EMPTY_STRING_SET,
            setCollapsedActivityKeys: noop,
            visibleActivityCountByKey: new Map(),
            setVisibleActivityCountByKey: noop,
          },
          groupProps: {
            hasSessionSearchQuery: false,
            normalizedSessionSearchQuery: "",
            groupSearchDataByGroup: new WeakMap(),
            collapsedGroups: EMPTY_STRING_SET,
            hideDirectoryControls: false,
            mobileVariant: false,
            alwaysShowActions: false,
            activeProjectId: "openchamber",
            notifyOnSubtasks: false,
            expandedParents: EMPTY_STRING_SET,
            editTitle: "",
            folderRename: null,
            setFolderRenameDraft: noop,
            clearFolderRename: noop,
            pinnedSessionIds: EMPTY_STRING_SET,
            sessionOrderIndex: EMPTY_ORDER_INDEX,
            ...sessionTreeActions,
          },
        }}
        view={{
          homeDirectory: "/home/dev",
          hasSessionSearchQuery: false,
          hideDirectoryControls: false,
          stickyZoneHeaders: false,
          mobileVariant: false,
          alwaysShowActions: false,
          projectSortOrder: "manual",
          worktreeSortOrder: "manual",
          timelineView: false,
        }}
        actions={{
          group: {
            showMoreGroupSessions: noop,
            resetGroupSessionLimit: noop,
            setActiveProjectIdOnly: noop,
            setSessionSwitcherOpen: noop,
            openNewSessionDraft: noop,
            onToggleCollapsedGroup: noop,
          },
          toggleProject: noop,
          setActiveProjectIdOnly: noop,
          setSessionSwitcherOpen: noop,
          openNewSessionDraft: noop,
          openNewWorktreeDialog: noop,
          openWorktreesPage: noop,
          openProjectEditDialog: noop,
          removeProject: noop,
          reorderProjects: noop,
          setGroupOrderByProject: noop,
          setSingleProjectId: noop,
        }}
      />
    </div>
  );
}
