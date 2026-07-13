import type { EventInspectorTabGroup, PathBranchingWorkspaceSession } from "./workspaceSettings.js";

export type EventInspectorState = {
  open: boolean;
  openEventIds: string[];
  expandedEventId?: string;
};

export const DEFAULT_EVENT_INSPECTOR_STATE: EventInspectorState = {
  open: true,
  openEventIds: [],
  expandedEventId: undefined,
};

function uniqueEventIds(eventIds: readonly string[]) {
  const seen = new Set<string>();
  return eventIds.filter((eventId) => {
    if (seen.has(eventId)) return false;
    seen.add(eventId);
    return true;
  });
}

function sameState(left: EventInspectorState, right: EventInspectorState) {
  return (
    left.open === right.open &&
    left.expandedEventId === right.expandedEventId &&
    left.openEventIds.length === right.openEventIds.length &&
    left.openEventIds.every((eventId, index) => eventId === right.openEventIds[index])
  );
}

export function restoreEventInspectorState(session: PathBranchingWorkspaceSession): EventInspectorState {
  const openEventIds = uniqueEventIds(session.eventInspectorOpenEventIds ?? []);
  const expandedEventId =
    session.eventInspectorExpandedEventId && openEventIds.includes(session.eventInspectorExpandedEventId)
      ? session.eventInspectorExpandedEventId
      : undefined;
  return {
    open: session.eventInspectorOpen ?? DEFAULT_EVENT_INSPECTOR_STATE.open,
    openEventIds,
    expandedEventId,
  };
}

export function openEventInspectorTab(state: EventInspectorState, eventId: string): EventInspectorState {
  const openEventIds = state.openEventIds.includes(eventId)
    ? state.openEventIds
    : [eventId, ...state.openEventIds];
  const nextState = {
    open: true,
    openEventIds,
    expandedEventId: eventId,
  };
  return sameState(state, nextState) ? state : nextState;
}

export function collapseEventInspectorTab(state: EventInspectorState, eventId: string): EventInspectorState {
  if (state.expandedEventId !== eventId) {
    return state;
  }
  return {
    ...state,
    expandedEventId: undefined,
  };
}

export function closeEventInspectorTab(
  state: EventInspectorState,
  eventId: string,
  options: { selectNextOnClose?: boolean } = {},
): EventInspectorState {
  const selectNextOnClose = options.selectNextOnClose ?? false;
  const closedIndex = state.openEventIds.indexOf(eventId);
  const openEventIds = state.openEventIds.filter((candidate) => candidate !== eventId);
  const expandedNeedsReplacement =
    state.expandedEventId === eventId || (state.expandedEventId !== undefined && !openEventIds.includes(state.expandedEventId));
  const expandedEventId = expandedNeedsReplacement
    ? selectNextOnClose
      ? openEventIds[closedIndex] ?? openEventIds[closedIndex - 1]
      : undefined
    : state.expandedEventId;
  const nextState = {
    open: openEventIds.length > 0 ? state.open : false,
    openEventIds,
    expandedEventId,
  };
  return sameState(state, nextState) ? state : nextState;
}

export function closeEventInspectorDock(state: EventInspectorState): EventInspectorState {
  if (!state.open && state.expandedEventId === undefined) {
    return state;
  }
  return {
    ...state,
    open: false,
    expandedEventId: undefined,
  };
}

export function closeAllEventInspectorTabs(state: EventInspectorState): EventInspectorState {
  if (state.openEventIds.length === 0 && !state.open && state.expandedEventId === undefined) {
    return state;
  }
  return { open: false, openEventIds: [], expandedEventId: undefined };
}

export function closeEventInspectorTabsAbove(state: EventInspectorState, eventId: string): EventInspectorState {
  const index = state.openEventIds.indexOf(eventId);
  if (index <= 0) {
    return state;
  }
  const openEventIds = state.openEventIds.slice(index);
  const expandedEventId = state.expandedEventId && openEventIds.includes(state.expandedEventId) ? state.expandedEventId : undefined;
  const nextState = { open: openEventIds.length > 0 ? state.open : false, openEventIds, expandedEventId };
  return sameState(state, nextState) ? state : nextState;
}

export function closeEventInspectorTabsBelow(state: EventInspectorState, eventId: string): EventInspectorState {
  const index = state.openEventIds.indexOf(eventId);
  if (index === -1 || index === state.openEventIds.length - 1) {
    return state;
  }
  const openEventIds = state.openEventIds.slice(0, index + 1);
  const expandedEventId = state.expandedEventId && openEventIds.includes(state.expandedEventId) ? state.expandedEventId : undefined;
  const nextState = { open: openEventIds.length > 0 ? state.open : false, openEventIds, expandedEventId };
  return sameState(state, nextState) ? state : nextState;
}

export function closeOtherEventInspectorTabs(state: EventInspectorState, eventId: string): EventInspectorState {
  if (!state.openEventIds.includes(eventId) || (state.openEventIds.length === 1 && state.openEventIds[0] === eventId)) {
    return state;
  }
  return { open: true, openEventIds: [eventId], expandedEventId: eventId };
}

export function pruneEventInspectorState(state: EventInspectorState, validEventIds: Iterable<string>): EventInspectorState {
  const validIds = new Set(validEventIds);
  const openEventIds = state.openEventIds.filter((eventId) => validIds.has(eventId));
  const expandedEventId = state.expandedEventId && validIds.has(state.expandedEventId) ? state.expandedEventId : undefined;
  const nextState = {
    open: openEventIds.length > 0 ? state.open : false,
    openEventIds,
    expandedEventId,
  };
  return sameState(state, nextState) ? state : nextState;
}

export function saveEventInspectorTabGroup(
  state: EventInspectorState,
  name: string,
  existingGroups: readonly EventInspectorTabGroup[],
  now = Date.now(),
): { groups: EventInspectorTabGroup[]; groupId?: string } {
  const trimmedName = name.trim();
  const eventIds = uniqueEventIds(state.openEventIds);
  if (!trimmedName) {
    return { groups: [...existingGroups] };
  }
  const expandedEventId = state.expandedEventId && eventIds.includes(state.expandedEventId) ? state.expandedEventId : eventIds[0];
  const existingIndex = existingGroups.findIndex((group) => group.name.localeCompare(trimmedName, undefined, { sensitivity: "accent" }) === 0);
  if (existingIndex >= 0) {
    const existingGroup = existingGroups[existingIndex];
    const nextGroup: EventInspectorTabGroup = {
      ...existingGroup,
      name: trimmedName,
      eventIds,
      expandedEventId,
      updatedAt: now,
    };
    const groups = [...existingGroups];
    groups[existingIndex] = nextGroup;
    return { groups, groupId: nextGroup.id };
  }
  const groupId = `event-tabs-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    groups: [
      ...existingGroups,
      {
        id: groupId,
        name: trimmedName,
        eventIds,
        expandedEventId,
        createdAt: now,
        updatedAt: now,
      },
    ],
    groupId,
  };
}

export function loadEventInspectorTabGroup(group: EventInspectorTabGroup): EventInspectorState {
  const openEventIds = uniqueEventIds(group.eventIds);
  if (openEventIds.length === 0) {
    return { open: false, openEventIds: [], expandedEventId: undefined };
  }
  const expandedEventId = group.expandedEventId && openEventIds.includes(group.expandedEventId) ? group.expandedEventId : openEventIds[0];
  return {
    open: true,
    openEventIds,
    expandedEventId,
  };
}

export function deleteEventInspectorTabGroup(groupId: string, existingGroups: readonly EventInspectorTabGroup[]) {
  return existingGroups.filter((group) => group.id !== groupId);
}

export function pruneEventInspectorTabGroups(
  existingGroups: readonly EventInspectorTabGroup[],
  validEventIds: Iterable<string>,
): EventInspectorTabGroup[] {
  const validIds = new Set(validEventIds);
  return existingGroups
    .map((group) => {
      const eventIds = uniqueEventIds(group.eventIds).filter((eventId) => validIds.has(eventId));
      const expandedEventId = group.expandedEventId && eventIds.includes(group.expandedEventId) ? group.expandedEventId : eventIds[0];
      return {
        ...group,
        eventIds,
        expandedEventId,
        inspectorExpandedTabId:
          group.inspectorExpandedTabId &&
          group.inspectorTabs?.some(
            (tab) => tab.id === group.inspectorExpandedTabId,
          )
            ? group.inspectorExpandedTabId
            : undefined,
      };
    })
    .filter(
      (group) =>
        group.eventIds.length > 0 || (group.inspectorTabs?.length ?? 0) > 0,
    );
}
