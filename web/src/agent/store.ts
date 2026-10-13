/* The agent's runs, shared by the button, the panel and the notice when one finishes: loaded once,
 * then kept current from the server's event stream. Also the conversation the panel is showing, and
 * `openAgent()` for any page that wants to hand the agent something. */
import { useSyncExternalStore } from "react";
import { type AgentRun, learn } from "../api";
import { onServerEvent } from "../api/events";

interface State {
  runs: AgentRun[];
  /** The conversation on show (its first run's id), or null for a fresh request. */
  thread: string | null;
}
let state: State = { runs: [], thread: null };
const listeners = new Set<() => void>();
const finishers = new Set<(run: AgentRun) => void>();
let started = false;

const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  for (const fn of listeners) fn();
};
const newestFirst = (list: AgentRun[]) => [...list].sort((a, b) => b.started.localeCompare(a.started));

/** Puts a run in the list (or updates it), telling the finishers when one stops running. */
export function upsert(run: AgentRun) {
  const before = state.runs.find((r) => r.id === run.id);
  set({ runs: newestFirst([run, ...state.runs.filter((r) => r.id !== run.id)]) });
  if (before?.status === "running" && run.status !== "running") for (const fn of finishers) fn(run);
}

function start() {
  if (started) return;
  started = true;
  learn.agents().then(
    (list) => set({ runs: newestFirst([...list, ...state.runs.filter((r) => !list.some((x) => x.id === r.id))]) }),
    () => {},
  );
  onServerEvent("agent", (data) => upsert(data as AgentRun));
}

const subscribe = (fn: () => void) => {
  start();
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** The runs (newest first), the conversation on show, and whether anything is being worked on. */
export function useAgent() {
  const s = useSyncExternalStore(subscribe, () => state);
  return { ...s, busy: s.runs.some((r) => r.status === "running") };
}

/** The conversation a run belongs to. */
export const threadOf = (run: AgentRun) => run.thread || run.id;

/** Shows a conversation in the panel (null: a fresh request). */
export const showThread = (thread: string | null) => set({ thread });

/** Calls `fn` whenever a run finishes (lands, answers, fails or waits for review). */
export function onFinished(fn: (run: AgentRun) => void) {
  start();
  finishers.add(fn);
  return () => {
    finishers.delete(fn);
  };
}

/** Opens the agent's panel, optionally with a request typed in (and sent). */
export function openAgent(options: { text?: string; send?: boolean; thread?: string } = {}) {
  window.dispatchEvent(new CustomEvent("classroom:agent", { detail: options }));
}
