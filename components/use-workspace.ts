"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  backgroundName,
  MAX_SAVED_BACKGROUNDS,
  selectBackgroundVersion,
  validateBackgroundFile,
} from "@/lib/backgrounds";
import { importImageLocally } from "@/lib/import-image";
import {
  emptyWorkspace,
  type Background,
  type FocusSession,
  type Preferences,
  type ServiceStatus,
  type Task,
  type User,
  type Workspace,
} from "@/lib/types";

export async function request<T>(url: string, method = "GET", value?: unknown): Promise<T> {
  const isForm = value instanceof FormData;
  const response = await fetch(url, {
    method,
    headers: value === undefined || isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? value : value === undefined ? undefined : JSON.stringify(value),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "That didn’t save. Please try again.");
  return data;
}
function readLocal(key: string): Workspace {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "null");
    if (
      value &&
      Array.isArray(value.tasks) &&
      Array.isArray(value.sessions) &&
      Array.isArray(value.backgrounds)
    )
      return {
        ...emptyWorkspace(),
        ...value,
        completions:
          value.completions ||
          value.tasks
            .filter((t: Task) => t.completedAt)
            .map((t: Task) => ({
              id: `${t.id}:${t.completedAt}`,
              taskId: t.id,
              title: t.title,
              completedAt: t.completedAt,
            })),
        preferences: { ...emptyWorkspace().preferences, ...value.preferences },
      };
  } catch {
    /* A blocked or cleared browser store starts a fresh workspace. */
  }
  return emptyWorkspace();
}

export function useWorkspace(notify: (message: string) => void) {
  const [data, setData] = useState<Workspace>(emptyWorkspace);
  const [user, setUser] = useState<User | null>(null);
  const [services, setServices] = useState<ServiceStatus>({
    auth: false,
    database: false,
    ai: false,
    todoist: false,
  });
  const [todoistConnected, setTodoistConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const storageKey = `pom.workspace.${user?.id || "guest"}`;
  const notifyRef = useRef(notify);
  notifyRef.current = notify;
  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const me = await request<{
          user: User | null;
          services: ServiceStatus;
          todoistConnected: boolean;
        }>("/api/me");
        if (cancelled) return;
        setUser(me.user);
        setServices(me.services);
        setTodoistConnected(me.todoistConnected);
        const key = `pom.workspace.${me.user?.id || "guest"}`;
        let value = readLocal(key);
        if (me.user && me.services.database) {
          try {
            const remote = await request<Workspace>("/api/workspace");
            value = {
              ...emptyWorkspace(),
              ...remote,
              preferences: { ...emptyWorkspace().preferences, ...remote.preferences },
            };
          } catch (error) {
            notifyRef.current(
              error instanceof Error ? error.message : "Couldn’t sync your workspace.",
            );
          }
          const pendingKey = `pom.pending.${me.user.id}`;
          let pending: FocusSession[] = [];
          try {
            pending = JSON.parse(localStorage.getItem(pendingKey) || "[]");
          } catch {
            /* use empty queue */
          }
          const remaining: FocusSession[] = [];
          for (const session of pending) {
            try {
              await request("/api/sessions", "POST", session);
            } catch {
              remaining.push(session);
            }
            if (!value.sessions.some((s) => s.id === session.id)) value.sessions.push(session);
          }
          localStorage.setItem(pendingKey, JSON.stringify(remaining));
        }
        if (!cancelled) {
          setData(value);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setData(readLocal("pom.workspace.guest"));
          setReady(true);
          notifyRef.current("You’re working locally. Your workspace will stay on this device.");
        }
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(data));
      } catch {
        notifyRef.current("Your browser couldn’t save this workspace. Check available storage.");
      }
    }
  }, [data, ready, storageKey]);

  const updatePreferences = useCallback(
    async (preferences: Preferences) => {
      if (user) await request("/api/settings", "PATCH", preferences);
      setData((d) => ({ ...d, preferences }));
    },
    [user],
  );
  const addTask = async (title: string, project = "Personal") => {
    let task: Task = {
      id: crypto.randomUUID(),
      title: title.trim(),
      project,
      completed: false,
      source: "local",
      priority: 1,
    };
    if (!task.title) return;
    if (user)
      task = (await request<{ task: Task }>("/api/tasks", "POST", { title: task.title, project }))
        .task;
    setData((d) => ({ ...d, tasks: [...d.tasks, task] }));
  };
  const toggleTask = async (task: Task) => {
    let next: Task = {
      ...task,
      completed: !task.completed,
      completedAt: !task.completed ? new Date().toISOString() : undefined,
    };
    if (user)
      next = (
        await request<{ task: Task }>("/api/tasks", "PATCH", {
          id: task.id,
          completed: !task.completed,
        })
      ).task;
    setData((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === task.id ? next : t)),
      completions:
        next.completed && next.completedAt
          ? [
              ...d.completions.filter((c) => c.id !== `${task.id}:${next.completedAt}`),
              {
                id: `${task.id}:${next.completedAt}`,
                taskId: task.id,
                title: task.title,
                completedAt: next.completedAt,
              },
            ]
          : d.completions.filter(
              (c) => !(c.taskId === task.id && c.completedAt === task.completedAt),
            ),
    }));
    if (next.completed) notify("One more thing done. Look at you grow. 🌱");
  };
  const deleteTask = async (task: Task) => {
    if (user) await request("/api/tasks", "DELETE", { id: task.id });
    setData((d) => ({ ...d, tasks: d.tasks.filter((t) => t.id !== task.id) }));
  };
  const recordSession = useCallback(
    async (session: FocusSession) => {
      setData((d) =>
        d.sessions.some((s) => s.id === session.id)
          ? d
          : { ...d, sessions: [...d.sessions, session] },
      );
      if (!user) return;
      const key = `pom.pending.${user.id}`;
      const read = (): FocusSession[] => {
        try {
          return JSON.parse(localStorage.getItem(key) || "[]");
        } catch {
          return [];
        }
      };
      const pending = read();
      if (!pending.some((s) => s.id === session.id))
        localStorage.setItem(key, JSON.stringify([...pending, session]));
      try {
        await request("/api/sessions", "POST", session);
        localStorage.setItem(key, JSON.stringify(read().filter((s) => s.id !== session.id)));
      } catch {
        notifyRef.current(
          "Session saved on this device. We’ll retry cloud sync when you reopen Pom.",
        );
      }
    },
    [user],
  );
  const syncTodoist = async (taskIds: string[]) => {
    if (!user) {
      notify("Sign in to connect your Todoist account.");
      throw new Error("Sign in to connect your Todoist account.");
    }
    if (!todoistConnected) {
      notify("Connect Todoist in Settings first.");
      throw new Error("Connect Todoist in Settings first.");
    }
    setSyncing(true);
    try {
      const result = await request<{
        tasks: Task[];
        completions?: Workspace["completions"];
        count: number;
      }>("/api/todoist/sync", "POST", { taskIds });
      setData((d) => ({
        ...d,
        tasks: result.tasks,
        completions: result.completions || d.completions,
      }));
      notify(`${result.count} Todoist ${result.count === 1 ? "task" : "tasks"} imported.`);
    } finally {
      setSyncing(false);
    }
  };
  const generate = async (prompt: string, backgroundId?: string) => {
    const result = await request<{ background: Background }>("/api/backgrounds", "POST", {
      prompt,
      backgroundId,
    });
    setData((d) => ({
      ...d,
      backgrounds: backgroundId
        ? d.backgrounds.map((b) => (b.id === backgroundId ? result.background : b))
        : [result.background, ...d.backgrounds],
    }));
    return result.background;
  };
  const chooseBackgroundVersion = async (id: string, versionId: string) => {
    const background = data.backgrounds.find((b) => b.id === id);
    if (!background) throw new Error("This scene is no longer available.");
    const next = user
      ? (await request<{ background: Background }>("/api/backgrounds", "PATCH", { id, versionId }))
          .background
      : selectBackgroundVersion(background, versionId);
    setData((d) => ({ ...d, backgrounds: d.backgrounds.map((b) => (b.id === id ? next : b)) }));
  };
  const deleteBackground = async (id: string) => {
    if (user) await request("/api/backgrounds", "DELETE", { id });
    setData((d) => ({ ...d, backgrounds: d.backgrounds.filter((b) => b.id !== id) }));
  };
  const importBackground = async (file: File) => {
    validateBackgroundFile(file);
    if (data.backgrounds.length >= MAX_SAVED_BACKGROUNDS)
      throw new Error(
        "Your library has 50 backgrounds. Remove one to make room for something new.",
      );
    let background: Background;
    if (user) {
      const form = new FormData();
      form.set("image", file);
      background = (await request<{ background: Background }>("/api/backgrounds", "PUT", form))
        .background;
    } else {
      background = {
        id: crypto.randomUUID(),
        name: backgroundName(file.name),
        prompt: "",
        url: await importImageLocally(file),
        createdAt: new Date().toISOString(),
        source: "upload",
      };
      // Verify the image fits before adding it to the guest's persistent library.
      try {
        const current = readLocal(storageKey);
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...current, backgrounds: [background, ...current.backgrounds] }),
        );
      } catch {
        throw new Error("Your browser couldn’t save this image. Free some storage and try again.");
      }
    }
    setData((d) => ({ ...d, backgrounds: [background, ...d.backgrounds] }));
    return background;
  };
  return {
    data,
    user,
    services,
    ready,
    todoistConnected,
    syncing,
    updatePreferences,
    addTask,
    toggleTask,
    deleteTask,
    recordSession,
    syncTodoist,
    generate,
    chooseBackgroundVersion,
    importBackground,
    deleteBackground,
  };
}
