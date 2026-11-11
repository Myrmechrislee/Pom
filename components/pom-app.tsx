"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCheck,
  CircleHelp,
  Clock3,
  Coffee,
  Flame,
  GripVertical,
  ImageIcon,
  Leaf,
  ListTodo,
  LoaderCircle,
  LogIn,
  LogOut,
  Maximize2,
  Moon,
  MoreHorizontal,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  SkipForward,
  Sparkles,
  Sprout,
  Sun,
  Target,
  Timer,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  SCENES,
  THEMES,
  type Background,
  type Preferences,
  type Task,
  type Theme,
} from "@/lib/types";
import {
  groupTasks,
  isDueToday,
  searchTasks,
  sortTasks,
  taskDueLabel,
  type TaskSort,
} from "@/lib/tasks";
import { aggregateStats, formatMinutes, localDateKey, streakDays } from "@/lib/stats";
import { BACKGROUND_IMAGE_TYPES, backgroundVersions } from "@/lib/backgrounds";
import { useWorkspace } from "./use-workspace";
import { useTimer } from "./use-timer";
import { useFocusMode } from "./use-focus-mode";
import { useSoundEffects } from "./use-sound-effects";
import Modal from "./modal";
import TimerReadout from "./timer-readout";
import SceneCaption from "./scene-caption";
import TimerSettings, { RhythmInputs } from "./timer-settings";
import TaskImportDialog from "./task-import-dialog";
import TaskSearch from "./task-search";
import FocusTasks from "./focus-tasks";
import BackgroundVersions from "./background-versions";
import SessionHistory from "./session-history";
import { useTaskReorder } from "./use-task-reorder";

type View = "focus" | "tasks" | "insights" | "backgrounds";
type Dialog = "settings" | "themes" | "generate" | "versions" | "import-tasks" | "help" | null;

function TodoistIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#de5745" />
      <path
        d="m5 7 4 2 10-5M5 12l4 2 10-5M5 17l4 2 10-5"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function Logo() {
  return (
    <span className="logo">
      <Sprout size={31} strokeWidth={1.6} />
      <span>
        pom<span className="logo-dot">.</span>
      </span>
    </span>
  );
}
function Stat({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Timer;
  label: string;
  value: React.ReactNode;
  detail: string;
}) {
  return (
    <div className="stat">
      <span className="stat-icon">
        <Icon size={19} strokeWidth={1.6} />
      </span>
      <div>
        <span className="stat-label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function CurrentTime() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return null;
  return (
    <time className="zen-clock" dateTime={now.toISOString()} aria-label="Current time">
      {now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })}
    </time>
  );
}

export default function PomApp() {
  const [view, setView] = useState<View>("focus");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [toast, setToast] = useState("");
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((message: string) => {
    setToast(message);
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    toastTimeout.current = setTimeout(() => setToast(""), 5500);
  }, []);
  const workspace = useWorkspace(notify);
  const { data, user, services, ready, todoistConnected, syncing } = workspace;
  const { preferences, tasks, completions, sessions, backgrounds } = data;
  const { play: playSound, prepare: prepareSound } = useSoundEffects(preferences.sound);
  const focus = useTimer(preferences, ready, user?.id, workspace.recordSession, notify);
  const { zen, browserFullscreen, fullscreenSupported, enterFocusMode, exitFocusMode } =
    useFocusMode({
      hydrated: focus.hydrated,
      running: focus.timer.running,
      autoFullscreen: preferences.autoFullscreen,
    });
  const toggleTimer = () => {
    playSound(focus.timer.running ? "pause" : "start");
    if (!focus.timer.running && preferences.autoFullscreen) enterFocusMode();
    focus.toggle();
  };
  const [sound, setSound] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const [period, setPeriod] = useState<"day" | "week" | "month">("week");
  const [taskFilter, setTaskFilter] = useState<"all" | "today" | "active" | "completed">("all");
  const [taskSort, setTaskSort] = useState<TaskSort>("manual");
  const [taskProject, setTaskProject] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [importing, setImporting] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [editingBackground, setEditingBackground] = useState<Background | null>(null);
  const [versionBackgroundId, setVersionBackgroundId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Preferences>(preferences);
  const [saving, setSaving] = useState(false);
  const [taskMenu, setTaskMenu] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const now = new Date();
  const dayKey = localDateKey(now);
  const today = useMemo(
    () => aggregateStats(sessions, completions, "day"),
    [sessions, completions, dayKey],
  );
  const todayMinutes = today.reduce((n, s) => n + s.minutes, 0),
    todayTasks = today.reduce((n, s) => n + s.tasks, 0);
  const streak = useMemo(() => streakDays(sessions), [sessions, dayKey]);
  const chart = useMemo(
    () => aggregateStats(sessions, completions, period),
    [sessions, completions, period, dayKey],
  );
  const activeTasks = tasks.filter((t) => !t.completed);
  const selectedTask = tasks.find((t) => t.id === focus.timer.taskId && !t.completed);
  const scene = SCENES.find((s) => s.id === preferences.background);
  const customScene = backgrounds.find((b) => b.id === preferences.background);
  const versionBackground = backgrounds.find((b) => b.id === versionBackgroundId);
  const sceneUrl = scene?.url || customScene?.url || SCENES[0].url;
  const sceneName = scene?.name || customScene?.name || "Quiet forest";
  const pageTitles = {
    focus: "Your workspace",
    tasks: "Your tasks",
    insights: "Your growth",
    backgrounds: "Your atmosphere",
  };
  const go = (next: View) => {
    if (zen) exitFocusMode();
    setView(next);
    setTaskMenu(null);
  };
  const attempt = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Something didn’t save. Please try again.");
    }
  };
  useEffect(() => {
    setMounted(true);
    return () => {
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      void audioRef.current?.close();
    };
  }, []);
  useLayoutEffect(() => {
    if (!ready) {
      // Keep the theme applied by the startup script while the workspace loads.
      try {
        const saved = localStorage.getItem("pom.theme");
        const theme = THEMES.find((candidate) => candidate.id === saved);
        if (theme) document.documentElement.dataset.theme = theme.id;
      } catch {
        // The default palette works when browser storage is unavailable.
      }
      return;
    }
    document.documentElement.dataset.theme = preferences.theme;
    try {
      localStorage.setItem("pom.theme", preferences.theme);
    } catch {
      // Applying a theme does not require browser storage.
    }
  }, [preferences.theme, ready]);
  useEffect(() => {
    if (dialog === "settings") setDraft(preferences);
  }, [dialog, preferences]);
  useEffect(() => {
    if (!ready) return;
    const query = new URLSearchParams(window.location.search);
    if (query.get("setup")) {
      setDialog("settings");
      notify("Add your Auth0 credentials to enable sign in.");
    }
    if (query.get("todoist") === "connected") {
      notify("Todoist is connected. Import your tasks to get started.");
      go("tasks");
    }
    if (query.get("todoist") === "cancelled")
      notify("Todoist connection cancelled. You can try again in Settings.");
    if (query.has("setup") || query.has("todoist"))
      window.history.replaceState({}, "", window.location.pathname);
  }, [ready, notify]);
  useEffect(() => {
    if (focus.hydrated && focus.timer.running && preferences.autoFullscreen) {
      setView("focus");
    }
  }, [focus.hydrated, focus.timer.running, preferences.autoFullscreen]);
  useEffect(() => {
    if (!zen) return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [zen]);
  useEffect(() => {
    document.title = focus.timer.running
      ? `${String(Math.floor(focus.remaining / 60)).padStart(2, "0")}:${String(focus.remaining % 60).padStart(2, "0")} · ${focus.timer.mode === "focus" ? "Focus" : "Rest"} — Pom`
      : "Pom — A little focus goes a long way";
  }, [focus.remaining, focus.timer.running, focus.timer.mode]);
  const toggleSound = () => {
    if (sound) {
      void audioRef.current?.close();
      audioRef.current = null;
      setSound(false);
      return;
    }
    try {
      const ctx = new AudioContext(),
        buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate),
        samples = buffer.getChannelData(0);
      let last = 0;
      for (let i = 0; i < samples.length; i++) {
        last = (last + Math.random() * 0.04 - 0.02) / 1.02;
        samples[i] = last * 3;
      }
      const source = ctx.createBufferSource(),
        gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = 0.15;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      audioRef.current = ctx;
      setSound(true);
    } catch {
      notify("Ambient sound isn’t available in this browser.");
    }
  };
  const signIn = (event: React.MouseEvent) => {
    if (!services.auth) {
      event.preventDefault();
      setDialog("settings");
      notify("Configure Auth0 to save your progress across devices.");
    }
  };
  const addTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskInput.trim() || adding) return;
    setAdding(true);
    await attempt(async () => {
      await workspace.addTask(taskInput);
      setTaskInput("");
    });
    setAdding(false);
  };
  const completeTask = async (task: Task) => {
    if (pendingTask) return;
    if (!task.completed) prepareSound();
    setPendingTask(task.id);
    await attempt(async () => {
      await workspace.toggleTask(task);
      if (!task.completed) playSound("complete");
    });
    setPendingTask(null);
  };
  const setPreference = async (value: Partial<Preferences>) =>
    attempt(() => workspace.updatePreferences({ ...preferences, ...value }));
  const chooseTheme = async (theme: Theme) => {
    await setPreference({ theme });
  };
  const selectBackground = (id: string) =>
    attempt(async () => {
      await workspace.updatePreferences({ ...preferences, background: id });
      go("focus");
    });
  const openGenerator = (background?: Background) => {
    setEditingBackground(background || null);
    setPrompt(background?.prompt || "");
    setDialog("generate");
  };
  const importTodoist = () => {
    if (!user || !todoistConnected) {
      setDialog("settings");
      return;
    }
    setDialog("import-tasks");
  };

  const searchingTasks = taskSearch.trim().length > 0;
  const filteredTasks = searchTasks(tasks, taskSearch).filter(
    (task) =>
      (!taskProject || (task.project || "Personal") === taskProject) &&
      (taskFilter === "all" ||
        (taskFilter === "today"
          ? isDueToday(task, dayKey)
          : taskFilter === "completed"
            ? task.completed
            : !task.completed)),
  );
  const sortedTasks = sortTasks(filteredTasks, taskSort, dayKey);
  const shownTasks = view === "focus" ? sortedTasks.slice(0, 4) : sortedTasks;
  const reorderTaskList = async (ids: string[]) => {
    const previousSort = taskSort;
    setTaskSort("manual");
    setTaskMenu(null);
    try {
      await workspace.reorderTasks(ids, dayKey);
    } catch (error) {
      setTaskSort(previousSort);
      notify(error instanceof Error ? error.message : "Couldn’t save your task order. Try again.");
      throw error;
    }
  };
  const taskReorder = useTaskReorder({
    tasks: shownTasks,
    disabled: workspace.reorderingTasks || pendingTask !== null || syncing,
    onReorder: reorderTaskList,
  });

  const taskList = (compact = false) => {
    const filter = taskFilter;
    const shown = shownTasks;
    const grouped = taskSort === "manual" && !tasks.some((task) => task.order !== undefined);
    const renderTask = (task: Task) => (
      <div
        key={task.id}
        className={`task-row ${task.completed ? "completed" : ""} ${focus.timer.taskId === task.id ? "selected" : ""}`}
        {...taskReorder.rowProps(task.id)}
      >
        <button {...taskReorder.handleProps(task)}>
          <GripVertical size={15} aria-hidden="true" />
        </button>
        <button
          className="task-check"
          aria-label={`${task.completed ? "Reopen" : "Complete"} ${task.title}`}
          disabled={pendingTask === task.id}
          onClick={() => void completeTask(task)}
        >
          {pendingTask === task.id ? (
            <LoaderCircle size={14} className="spin" />
          ) : task.completed ? (
            <Check size={14} />
          ) : null}
        </button>
        <button
          className="task-info"
          onClick={() => {
            focus.selectTask(task.id);
            if (view === "tasks") go("focus");
          }}
          disabled={task.completed}
          title="Focus on this task"
        >
          <span>{task.title}</span>
          <small>
            {task.source === "todoist" && <TodoistIcon size={11} />}
            <span>{task.project || "Personal"}</span>
            {task.due && (
              <>
                <span>·</span>
                <span>
                  {new Date(`${task.due.slice(0, 10)}T12:00:00`).toLocaleDateString("en", {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </>
            )}
            {!grouped && !task.completed && (
              <>
                <span>·</span>
                <span>{taskDueLabel(task, dayKey)}</span>
              </>
            )}
            {focus.timer.taskId === task.id && !task.completed && (
              <span className="focusing-label">Focusing</span>
            )}
          </small>
        </button>
        {task.source === "local" && (
          <div className="task-menu">
            <button
              className="icon-button small"
              aria-label={`Options for ${task.title}`}
              onClick={() => setTaskMenu(taskMenu === task.id ? null : task.id)}
            >
              <MoreHorizontal size={17} />
            </button>
            {taskMenu === task.id && (
              <button
                className="delete-task"
                onClick={() => {
                  setTaskMenu(null);
                  void attempt(() => workspace.deleteTask(task));
                }}
              >
                <Trash2 size={14} /> Delete task
              </button>
            )}
          </div>
        )}
      </div>
    );
    return (
      <>
        <TaskSearch value={taskSearch} onChange={setTaskSearch} />
        <span className="sr-only" role="status" aria-atomic="true">
          {searchingTasks &&
            `${sortedTasks.length} ${sortedTasks.length === 1 ? "task" : "tasks"} found`}
        </span>
        <div className="task-list-controls">
          {compact && (
            <label>
              <span>Show</span>
              <select
                aria-label="Filter tasks"
                value={taskFilter}
                onChange={(event) => setTaskFilter(event.target.value as typeof taskFilter)}
              >
                <option value="all">All tasks</option>
                <option value="today">Due today</option>
                <option value="active">To do</option>
                <option value="completed">Done</option>
              </select>
            </label>
          )}
          <label>
            <span>Project</span>
            <select
              aria-label="Filter by project"
              value={taskProject}
              onChange={(event) => setTaskProject(event.target.value)}
            >
              <option value="">All projects</option>
              {[...new Set(tasks.map((task) => task.project || "Personal"))]
                .sort((a, b) => a.localeCompare(b))
                .map((project) => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select
              aria-label="Sort tasks"
              value={taskSort}
              disabled={workspace.reorderingTasks}
              onChange={(event) => setTaskSort(event.target.value as TaskSort)}
            >
              <option value="manual">Manual order</option>
              <option value="due">Due date</option>
              <option value="priority">Priority</option>
              <option value="title">Title A–Z</option>
              <option value="project">Project A–Z</option>
            </select>
          </label>
        </div>
        <span className="sr-only" id={taskReorder.instructionsId}>
          Drag to reorder. With a handle focused, use the Up and Down arrow keys to move a task.
          Reordering switches to manual order.
        </span>
        <span className="sr-only" aria-live="polite" aria-atomic="true">
          {taskReorder.announcement}
        </span>
        {shown.length > 0 ? (
          <div className="task-items" data-reorder-list aria-busy={workspace.reorderingTasks}>
            {grouped
              ? groupTasks(shown, dayKey).map((group) => (
                  <section className="task-group" key={group.id} aria-label={group.label}>
                    <h3 className="task-group-title">
                      {group.label} <span>{group.count}</span>
                    </h3>
                    {group.categories.map((category) => (
                      <div className="task-category" key={category.name}>
                        <h4 className="task-category-title">{category.name}</h4>
                        {category.tasks.map(renderTask)}
                      </div>
                    ))}
                  </section>
                ))
              : shown.map(renderTask)}
          </div>
        ) : (
          <div className={`empty-tasks ${compact ? "compact" : ""}`}>
            <span className="empty-icon">
              <ListTodo size={27} strokeWidth={1.3} />
            </span>
            <h3>
              {searchingTasks || taskProject
                ? "No matching tasks."
                : filter === "today"
                  ? "A little room in your day."
                  : filter === "completed"
                    ? "Good things take a little time."
                    : "A clear mind starts here."}
            </h3>
            <p>
              {searchingTasks
                ? "Try another search or adjust your filters."
                : taskProject
                  ? "Try another project or task filter."
                  : filter === "today"
                    ? "No tasks due today. Add a task or choose one to import."
                    : filter === "completed"
                      ? "Your completed tasks will find a home here."
                      : "Add a small task, or bring your list from Todoist."}
            </p>
            {!searchingTasks && filter !== "completed" && (
              <button className="text-link" onClick={importTodoist}>
                <TodoistIcon size={15} />
                Import from Todoist
                <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        )}
        <form className="add-task" onSubmit={addTask}>
          <Plus size={17} />
          <input
            aria-label="New task"
            placeholder="Add a task. Make a little progress."
            value={taskInput}
            maxLength={200}
            onChange={(e) => setTaskInput(e.target.value)}
          />
          <button
            className="icon-button small"
            type="submit"
            disabled={!taskInput.trim() || adding}
            aria-label="Add task"
          >
            {adding ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}
          </button>
        </form>
        {compact && sortedTasks.length > 4 && (
          <button className="view-all" onClick={() => go("tasks")}>
            View all {sortedTasks.length} tasks
            <ArrowRight size={14} />
          </button>
        )}
      </>
    );
  };

  const backgroundGrid = () => (
    <div className="scene-grid">
      {SCENES.map((s) => (
        <button
          key={s.id}
          className={`scene-card ${preferences.background === s.id ? "active" : ""}`}
          onClick={() => void selectBackground(s.id)}
        >
          <div className="scene-image" style={{ backgroundImage: `url("${s.url}")` }}>
            {preferences.background === s.id && (
              <span className="scene-check">
                <Check size={15} />
              </span>
            )}
          </div>
          <span className="scene-card-name">{s.name}</span>
          <small>{s.subtitle}</small>
        </button>
      ))}
    </div>
  );

  return (
    <div className={`app-shell ${zen ? "zen" : ""}`}>
      <aside className="sidebar">
        <a href="/" className="brand" aria-label="Pom home">
          <Logo />
        </a>
        <span className="brand-tagline">A little focus. A little growth.</span>
        <div className="nav-label">YOUR LITTLE CORNER</div>
        <nav aria-label="Main navigation">
          {(
            [
              { id: "focus", label: "Focus space", icon: Timer },
              { id: "tasks", label: "My tasks", icon: ListTodo },
              { id: "insights", label: "My growth", icon: BarChart3 },
              { id: "backgrounds", label: "Backgrounds", icon: ImageIcon },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => go(item.id)}
              aria-current={view === item.id ? "page" : undefined}
            >
              <item.icon size={19} strokeWidth={1.7} />
              <span>{item.label}</span>
              {item.id === "tasks" && activeTasks.length > 0 && (
                <span className="nav-count">{activeTasks.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="note-sun">
            <Sun size={28} strokeWidth={1.2} />
          </span>
          <p>
            You don’t have to do it all.
            <br />
            Just the next little thing.
          </p>
          <span className="note-line" />
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => setDialog("settings")}>
            <Settings2 size={18} strokeWidth={1.7} />
            <span>Settings</span>
          </button>
          <button className="nav-item" onClick={() => setDialog("help")}>
            <CircleHelp size={18} strokeWidth={1.7} />
            <span>A little guidance</span>
          </button>
          <div className="sidebar-user">
            <button
              className="avatar"
              aria-label="Open your profile"
              onClick={() => go("insights")}
            >
              {user ? user.name.slice(0, 1).toUpperCase() : <Sprout size={21} />}
            </button>
            <button
              className="user-text"
              onClick={() => (user ? go("insights") : setDialog("settings"))}
            >
              <strong>{user?.name.split(" ")[0] || "Hello, friend"}</strong>
              <small>{user ? "Your personal space" : "Make yourself at home"}</small>
            </button>
            {user ? (
              <a className="icon-button" href="/auth/logout" aria-label="Sign out">
                <LogOut size={16} />
              </a>
            ) : (
              <a className="icon-button" href="/auth/login" onClick={signIn} aria-label="Sign in">
                <LogIn size={17} />
              </a>
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            <span className="online-dot" />
            {pageTitles[view]}
            <span className="breadcrumb-separator">/</span>
            <span className="breadcrumb-soft">
              {view === "focus" ? "A fresh start" : "One day at a time"}
            </span>
          </span>
          <div className="topbar-right">
            <span className="today-date">
              <Sun size={15} />
              {mounted
                ? now.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })
                : "A good day to begin"}
            </span>
            <button
              className="icon-button theme-shortcut"
              onClick={() => setDialog("themes")}
              aria-label="Change theme"
            >
              <Palette size={18} />
            </button>
            <button
              className="avatar small-avatar"
              onClick={() => go("insights")}
              aria-label="View profile"
            >
              {user ? user.name.slice(0, 1).toUpperCase() : <Sprout size={18} />}
            </button>
          </div>
        </header>
        <main className={`main-content ${view === "focus" ? "focus-view" : ""}`}>
          {view === "focus" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow greeting">
                    <span />
                    LET’S MAKE A LITTLE PROGRESS
                  </div>
                  <h1>
                    A little focus goes a long way<span className="heading-dot">.</span>
                  </h1>
                  <p>Settle in, take a breath, and give one thing your attention.</p>
                </div>
                <button
                  className="button secondary appearance-button"
                  onClick={() => setDialog("themes")}
                >
                  <Palette size={16} />
                  Make it yours
                </button>
              </div>
              <TimerSettings
                preferences={preferences}
                ready={ready}
                onSave={async (rhythm) => {
                  await workspace.updatePreferences({ ...preferences, ...rhythm });
                  notify("Your timer settings, saved.");
                }}
                onMoreSettings={() => setDialog("settings")}
              />
              <div className="workspace-grid">
                <section
                  className="timer-card"
                  aria-label="Focus timer"
                  style={{
                    backgroundImage: `linear-gradient(180deg, rgba(11,25,14,.20), rgba(11,25,14,.34)), url("${sceneUrl}")`,
                  }}
                >
                  <div className="timer-top">
                    <span className="live-badge">
                      <span />
                      {focus.timer.running
                        ? focus.timer.mode === "focus"
                          ? "IN THE FLOW"
                          : "A MOMENT TO REST"
                        : "A MOMENT FOR YOU"}
                    </span>
                    <div className="timer-top-actions">
                      {zen && <CurrentTime />}
                      {zen && fullscreenSupported && !browserFullscreen && (
                        <button
                          className="glass-icon"
                          onClick={enterFocusMode}
                          aria-label="Enter browser fullscreen"
                          title="Enter fullscreen"
                        >
                          <Maximize2 size={17} />
                        </button>
                      )}
                      <button
                        className="glass-icon"
                        onClick={() => setDialog("settings")}
                        aria-label="Timer settings"
                      >
                        <Settings2 size={17} />
                      </button>
                      <button
                        className="glass-icon"
                        onClick={zen ? exitFocusMode : enterFocusMode}
                        aria-label={
                          zen ? "Exit distraction-free mode" : "Enter distraction-free mode"
                        }
                      >
                        {zen ? <X size={17} /> : <Maximize2 size={17} />}
                      </button>
                    </div>
                  </div>
                  <div className="timer-body">
                    <div className="timer-center">
                      <div className="timer-tabs" role="tablist" aria-label="Timer mode">
                        {(
                          [
                            { id: "focus", label: "Focus", icon: Leaf },
                            { id: "rest", label: "Short break", icon: Coffee },
                            { id: "longRest", label: "Long break", icon: Moon },
                          ] as const
                        ).map((mode) => (
                          <button
                            key={mode.id}
                            role="tab"
                            aria-selected={focus.timer.mode === mode.id}
                            className={focus.timer.mode === mode.id ? "active" : ""}
                            onClick={() => focus.selectMode(mode.id)}
                          >
                            <mode.icon size={14} />
                            {mode.label}
                          </button>
                        ))}
                      </div>
                      {selectedTask && (
                        <div className="zen-task">
                          <span>Focusing on</span>
                          <strong>{selectedTask.title}</strong>
                        </div>
                      )}
                      <TimerReadout
                        remaining={focus.remaining}
                        total={focus.timer.remaining + focus.timer.elapsed}
                        running={focus.timer.running}
                        style={preferences.timerProgress}
                        animated={preferences.animateProgress}
                      >
                        <div
                          className="timer-digits"
                          aria-label={`${Math.floor(focus.remaining / 60)} minutes ${focus.remaining % 60} seconds remaining`}
                        >
                          {String(Math.floor(focus.remaining / 60)).padStart(2, "0")}
                          <span>:</span>
                          {String(focus.remaining % 60).padStart(2, "0")}
                        </div>
                      </TimerReadout>
                      <p className="timer-caption">
                        {focus.timer.mode !== "focus"
                          ? "Step away. Breathe. You’ve earned this."
                          : focus.timer.running
                            ? "Right here, right now. You’re doing enough."
                            : "Nothing to rush. Just begin."}
                      </p>
                      <div className="timer-controls">
                        <button
                          className="glass-icon"
                          onClick={focus.reset}
                          disabled={!focus.hydrated}
                          aria-label="Reset timer"
                        >
                          <RotateCcw size={19} />
                        </button>
                        <button
                          className="start-button"
                          onClick={toggleTimer}
                          disabled={!focus.hydrated}
                        >
                          {focus.timer.running ? (
                            <Pause size={17} fill="currentColor" />
                          ) : (
                            <Play size={16} fill="currentColor" />
                          )}
                          {focus.timer.running
                            ? "Pause"
                            : focus.timer.startedAt
                              ? "Keep going"
                              : focus.timer.mode === "focus"
                                ? "Start focusing"
                                : "Start break"}
                        </button>
                        <button
                          className="glass-icon"
                          onClick={focus.skip}
                          disabled={!focus.hydrated}
                          aria-label="Skip to next timer mode"
                        >
                          <SkipForward size={19} />
                        </button>
                      </div>
                      <div
                        className="session-dots"
                        aria-label={`Session ${((focus.timer.round - 1) % preferences.sessionsBeforeLongBreak) + 1} of ${preferences.sessionsBeforeLongBreak}`}
                      >
                        {Array.from({ length: preferences.sessionsBeforeLongBreak }, (_, i) => (
                          <span
                            key={i}
                            className={
                              i <= (focus.timer.round - 1) % preferences.sessionsBeforeLongBreak
                                ? "filled"
                                : ""
                            }
                          />
                        ))}
                        <span className="session-label">
                          Session{" "}
                          {((focus.timer.round - 1) % preferences.sessionsBeforeLongBreak) + 1} of{" "}
                          {preferences.sessionsBeforeLongBreak}
                        </span>
                      </div>
                    </div>
                    {zen && (
                      <FocusTasks
                        tasks={tasks}
                        search={taskSearch}
                        onSearchChange={setTaskSearch}
                        today={dayKey}
                        selectedTaskId={selectedTask?.id}
                        pendingTask={pendingTask}
                        onSelect={focus.selectTask}
                        onComplete={completeTask}
                        reordering={workspace.reorderingTasks || syncing}
                        onReorder={reorderTaskList}
                      />
                    )}
                  </div>
                  <div className="timer-bottom">
                    <SceneCaption name={sceneName} onChange={() => go("backgrounds")} />
                    <button
                      className={`sound-button ${sound ? "active" : ""}`}
                      onClick={toggleSound}
                    >
                      {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
                      <span>{sound ? "Forest ambience" : "Sound off"}</span>
                    </button>
                  </div>
                </section>
                <aside className="focus-side">
                  <section className="tasks-card panel">
                    <div className="card-heading">
                      <div className="card-title">
                        <ListTodo size={17} />
                        <h2>A little to-do</h2>
                        <span className="count-badge">{activeTasks.length}</span>
                      </div>
                      <button
                        className={`icon-button small ${syncing ? "spin" : ""}`}
                        onClick={importTodoist}
                        aria-label="Sync Todoist"
                        disabled={syncing}
                      >
                        <RefreshCw size={15} />
                      </button>
                    </div>
                    <p className="card-subtitle">One thing at a time is plenty.</p>
                    {taskList(true)}
                    <div className="todoist-footer">
                      <TodoistIcon size={14} />
                      <span>
                        {todoistConnected
                          ? "Connected to Todoist"
                          : "Your list, a little more connected"}
                      </span>
                      <button onClick={importTodoist}>
                        {todoistConnected ? "Sync" : "Connect"}
                        <ArrowUpRight size={12} />
                      </button>
                    </div>
                  </section>
                  <section className="intention-card">
                    <span className="intention-icon">
                      <Sparkles size={17} strokeWidth={1.4} />
                    </span>
                    <div>
                      <span className="eyebrow">A GENTLE REMINDER</span>
                      <p>
                        Progress is a practice,
                        <br />
                        not a perfect moment.
                      </p>
                    </div>
                    <span className="intention-leaf">
                      <Sprout size={42} strokeWidth={0.8} />
                    </span>
                  </section>
                </aside>
              </div>
              <div className="focus-task-line">
                <span className={`focus-task-dot ${selectedTask ? "has-task" : ""}`} />
                {selectedTask ? (
                  <>
                    <span>Making room for</span>
                    <strong>{selectedTask.title}</strong>
                    <button
                      onClick={() => focus.selectTask(undefined)}
                      aria-label="Clear focused task"
                    >
                      <X size={13} />
                    </button>
                  </>
                ) : (
                  <>
                    <span>A little intention helps.</span>
                    <button
                      onClick={() => {
                        go("tasks");
                      }}
                    >
                      Choose a task to focus on
                      <ArrowRight size={13} />
                    </button>
                  </>
                )}
              </div>
              <section className="today-section">
                <div className="section-heading">
                  <div>
                    <h2>
                      Your day, so far
                      <span className="small-sprout">
                        <Sprout size={17} />
                      </span>
                    </h2>
                    <span>Every little bit adds up.</span>
                  </div>
                  <button className="text-link" onClick={() => go("insights")}>
                    See your growth
                    <ArrowUpRight size={15} />
                  </button>
                </div>
                <div className="stats-row">
                  <Stat
                    icon={Clock3}
                    label="Time well spent"
                    value={formatMinutes(todayMinutes)}
                    detail="of focused time today"
                  />
                  <Stat
                    icon={CheckCheck}
                    label="Little wins"
                    value={
                      <>
                        {todayTasks}
                        <span className="stat-unit">tasks</span>
                      </>
                    }
                    detail="one less thing on your mind"
                  />
                  <Stat
                    icon={Flame}
                    label="Showing up"
                    value={
                      <>
                        {streak}
                        <span className="stat-unit">{streak === 1 ? "day" : "days"}</span>
                      </>
                    }
                    detail={
                      streak ? "keep your little streak growing" : "your next chapter starts today"
                    }
                  />
                  <div className="daily-goal">
                    <div
                      className="goal-ring"
                      style={
                        {
                          "--progress": `${Math.min(100, (todayMinutes / preferences.dailyGoal) * 100)}%`,
                        } as React.CSSProperties
                      }
                    >
                      <span>
                        <Sprout size={21} />
                      </span>
                    </div>
                    <div>
                      <span className="stat-label">Your daily intention</span>
                      <strong>
                        {Math.round(todayMinutes)} <span>/ {preferences.dailyGoal} min</span>
                      </strong>
                      <small>
                        {todayMinutes >= preferences.dailyGoal
                          ? "A little goal, beautifully reached."
                          : "You’ve got room to grow."}
                      </small>
                    </div>
                    <button
                      className="icon-button small"
                      onClick={() => setDialog("settings")}
                      aria-label="Edit daily goal"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>
              </section>
              <section className="atmosphere-preview">
                <div>
                  <span className="eyebrow">SET THE MOOD</span>
                  <h2>A space that feels like you.</h2>
                  <p>A change of scenery can change a whole day.</p>
                  <button className="text-link" onClick={() => go("backgrounds")}>
                    Explore backgrounds
                    <ArrowRight size={14} />
                  </button>
                </div>
                <div className="mini-scenes">
                  {SCENES.slice(0, 3).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => void setPreference({ background: s.id })}
                      className={preferences.background === s.id ? "active" : ""}
                      aria-label={`Use ${s.name} background`}
                      style={{ backgroundImage: `url("${s.url}")` }}
                    >
                      <span>{s.name}</span>
                      {preferences.background === s.id && (
                        <span className="mini-check">
                          <Check size={12} />
                        </span>
                      )}
                    </button>
                  ))}
                  <button className="generate-mini" onClick={() => openGenerator()}>
                    <Sparkles size={22} strokeWidth={1.3} />
                    <span>Dream it up</span>
                    <small>Create with AI</small>
                  </button>
                </div>
              </section>
              <footer className="page-footer">
                <span>
                  <Sprout size={13} />
                  Made for a more mindful kind of productive.
                </span>
                <span>Little by little, you’ll get there.</span>
              </footer>
            </>
          )}
          {view === "tasks" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">CLEAR A LITTLE SPACE</div>
                  <h1>A small list. A fresh mind.</h1>
                  <p>You don’t have to do it all today. Start with one thing.</p>
                </div>
                <button className="button secondary" onClick={importTodoist} disabled={syncing}>
                  {syncing ? <RefreshCw size={16} className="spin" /> : <TodoistIcon size={17} />}{" "}
                  {todoistConnected ? "Sync Todoist" : "Import from Todoist"}
                </button>
              </div>
              <div className="tasks-page-grid">
                <section className="panel full-tasks">
                  <div className="card-heading">
                    <h2>
                      Your little to-do list{" "}
                      <span className="count-badge">{activeTasks.length}</span>
                    </h2>
                    <div className="segmented-control">
                      {(["all", "today", "active", "completed"] as const).map((f) => (
                        <button
                          key={f}
                          onClick={() => setTaskFilter(f)}
                          className={taskFilter === f ? "active" : ""}
                          aria-pressed={taskFilter === f}
                        >
                          {f === "all"
                            ? "All tasks"
                            : f === "today"
                              ? "Due today"
                              : f === "active"
                                ? "To do"
                                : "Done"}
                        </button>
                      ))}
                    </div>
                  </div>
                  {taskList()}
                </section>
                <aside>
                  <div className="panel task-aside">
                    <Target size={27} strokeWidth={1.3} />
                    <h3>
                      Make one thing
                      <br />
                      your thing.
                    </h3>
                    <p>
                      Click any task to bring it into your focus space. A little intention makes a
                      big difference.
                    </p>
                    <span className="soft-divider" />
                    <span className="eyebrow">YOUR LITTLE WINS</span>
                    <strong className="task-count-big">{completions.length}</strong>
                    <p>tasks completed, one at a time.</p>
                  </div>
                </aside>
              </div>
            </>
          )}
          {view === "insights" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">LOOK HOW FAR YOU’VE COME</div>
                  <h1>Your effort is growing roots.</h1>
                  <p>
                    {user ? `${user.name.split(" ")[0]}, every` : "Every"} minute you show up for
                    yourself counts.
                  </p>
                </div>
                <button className="button secondary" onClick={() => setDialog("settings")}>
                  <Settings2 size={16} />
                  Your profile
                </button>
              </div>
              <div className="profile-banner">
                <div className="profile-avatar">
                  {user ? user.name[0].toUpperCase() : <Sprout size={34} strokeWidth={1.4} />}
                </div>
                <div>
                  <h2>{user?.name || "Your own little corner"}</h2>
                  <p>{user?.email || "A guest workspace, saved on this device."}</p>
                </div>
                <span className="profile-status">
                  <span />
                  {user ? "Personal workspace" : "Growing at your own pace"}
                </span>
              </div>
              <div className="insight-stats">
                <Stat
                  icon={Clock3}
                  label="Total focus time"
                  value={formatMinutes(sessions.reduce((n, s) => n + s.seconds / 60, 0))}
                  detail="time you made for what matters"
                />
                <Stat
                  icon={CheckCheck}
                  label="Tasks completed"
                  value={completions.length}
                  detail="little things, big progress"
                />
                <Stat
                  icon={Flame}
                  label="Current streak"
                  value={`${streak} ${streak === 1 ? "day" : "days"}`}
                  detail="showing up is the first step"
                />
                <Stat
                  icon={Target}
                  label="Focus sessions"
                  value={sessions.filter((s) => s.completed).length}
                  detail="moments of undivided attention"
                />
              </div>
              <section className="panel chart-panel">
                <div className="section-heading">
                  <div>
                    <h2>A picture of your progress</h2>
                    <span>
                      {period === "day"
                        ? "Today, hour by hour"
                        : period === "week"
                          ? "This week, one day at a time"
                          : now.toLocaleDateString("en", { month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <div className="segmented-control" aria-label="Statistics period">
                    {(["day", "week", "month"] as const).map((p) => (
                      <button
                        key={p}
                        className={period === p ? "active" : ""}
                        onClick={() => setPeriod(p)}
                      >
                        {p === "day" ? "Daily" : p === "week" ? "Weekly" : "Monthly"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chart-key">
                  <span>
                    <i />
                    Focus time{" "}
                    <strong>{formatMinutes(chart.reduce((n, d) => n + d.minutes, 0))}</strong>
                  </span>
                  <span>
                    <i />
                    Tasks completed <strong>{chart.reduce((n, d) => n + d.tasks, 0)}</strong>
                  </span>
                </div>
                <div className="progress-chart">
                  {mounted && (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={chart}
                        barGap={5}
                        margin={{ top: 15, right: 10, left: -23, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 5"
                          vertical={false}
                          stroke="var(--border)"
                        />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          minTickGap={period === "day" ? 30 : 10}
                        />
                        <YAxis
                          yAxisId="time"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 11 }}
                          unit="m"
                          allowDecimals={false}
                        />
                        <YAxis
                          yAxisId="tasks"
                          orientation="right"
                          width={26}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: "var(--muted)", fontSize: 10 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          cursor={{ fill: "var(--accent-soft)" }}
                          contentStyle={{
                            background: "var(--panel)",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            fontSize: 12,
                          }}
                          formatter={(v, name) => [name === "Focus time" ? `${v} min` : v, name]}
                        />
                        <Bar
                          yAxisId="time"
                          dataKey="minutes"
                          name="Focus time"
                          fill="var(--accent)"
                          radius={[5, 5, 0, 0]}
                          maxBarSize={30}
                        />
                        <Bar
                          yAxisId="tasks"
                          dataKey="tasks"
                          name="Tasks completed"
                          fill="var(--chart-secondary)"
                          radius={[5, 5, 0, 0]}
                          maxBarSize={30}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                {sessions.length === 0 && completions.length === 0 && (
                  <div className="chart-empty-note">
                    <Sprout size={16} />
                    Your story starts with a single session. We’ll keep track of the rest.
                  </div>
                )}
              </section>
              <SessionHistory
                sessions={sessions}
                tasks={tasks}
                currentSessionId={focus.timer.startedAt ? focus.timer.id : undefined}
                onEdit={workspace.editSession}
                onDelete={workspace.deleteSession}
              />
            </>
          )}
          {view === "backgrounds" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">A CHANGE OF SCENERY</div>
                  <h1>Find your happy place.</h1>
                  <p>A quiet forest, an open ocean, or a little world of your own.</p>
                </div>
                <div className="background-actions">
                  <div className="background-buttons">
                    <button
                      className="button secondary"
                      disabled={!ready || importing || generating}
                      onClick={() => imageInput.current?.click()}
                    >
                      {importing ? (
                        <LoaderCircle size={16} className="spin" />
                      ) : (
                        <Upload size={16} />
                      )}
                      {importing ? "Importing image…" : "Import image"}
                    </button>
                    <button
                      className="button primary"
                      disabled={importing}
                      onClick={() => openGenerator()}
                    >
                      <Sparkles size={16} />
                      Create with AI
                    </button>
                  </div>
                  <small id="image-import-help">JPG, PNG, WebP or GIF · Up to 8 MB</small>
                  <input
                    ref={imageInput}
                    type="file"
                    hidden
                    aria-label="Import background image"
                    aria-describedby="image-import-help"
                    accept={BACKGROUND_IMAGE_TYPES.join(",")}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0];
                      e.currentTarget.value = "";
                      if (!file || importing) return;
                      setImporting(true);
                      void attempt(async () => {
                        const background = await workspace.importBackground(file);
                        await workspace.updatePreferences({
                          ...preferences,
                          background: background.id,
                        });
                        notify("Your image is saved and ready for a little focus.");
                        go("focus");
                      }).finally(() => setImporting(false));
                    }}
                  />
                </div>
              </div>
              <div className="library-heading">
                <h2>A little escape</h2>
                <span>Handpicked places to find your focus.</span>
              </div>
              {backgroundGrid()}
              <section className="generated-library">
                <div className="section-heading">
                  <div>
                    <h2>
                      Your saved scenes <span className="count-badge">{backgrounds.length}</span>
                    </h2>
                    <span>Your images and creations, saved for whenever you need them.</span>
                  </div>
                  <Sparkles size={19} />
                </div>
                {backgrounds.length ? (
                  <div className="scene-grid">
                    {backgrounds.map((b) => (
                      <div className="saved-scene" key={b.id}>
                        <button
                          className={`scene-card ${preferences.background === b.id ? "active" : ""}`}
                          onClick={() => void selectBackground(b.id)}
                        >
                          <div
                            className="scene-image"
                            style={{ backgroundImage: `url("${b.url}")` }}
                          >
                            {preferences.background === b.id && (
                              <span className="scene-check">
                                <Check size={15} />
                              </span>
                            )}
                          </div>
                          <span className="scene-card-name">{b.name}</span>
                          <small>
                            {new Date(b.createdAt).toLocaleDateString("en", {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            · {b.source === "upload" ? "Imported image" : "Created with AI"}
                          </small>
                        </button>
                        {backgroundVersions(b).length > 1 && (
                          <button
                            className="scene-versions text-link"
                            aria-label={`Choose version for ${b.name}`}
                            disabled={generating || importing}
                            onClick={() => {
                              setVersionBackgroundId(b.id);
                              setDialog("versions");
                            }}
                          >
                            {backgroundVersions(b).length} versions · Version{" "}
                            {backgroundVersions(b).findIndex(
                              (v) => v.id === (b.selectedVersionId || b.id),
                            ) + 1}{" "}
                            selected
                          </button>
                        )}
                        {b.source !== "upload" && b.prompt && (
                          <button
                            className="edit-scene text-link"
                            aria-label={`Edit prompt for ${b.name}`}
                            disabled={generating || importing}
                            onClick={() => openGenerator(b)}
                          >
                            <Pencil size={12} /> Edit prompt
                          </button>
                        )}
                        <button
                          className="remove-scene icon-button"
                          aria-label={`Delete ${b.name}`}
                          onClick={() =>
                            void attempt(async () => {
                              if (preferences.background === b.id)
                                await workspace.updatePreferences({
                                  ...preferences,
                                  background: "forest",
                                });
                              await workspace.deleteBackground(b.id);
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-library">
                    <div className="dream-art">
                      <Sparkles size={32} strokeWidth={1} />
                      <span />
                      <span />
                    </div>
                    <h3>
                      A little world of your own.
                      <br />
                      Bring it here.
                    </h3>
                    <p>
                      Import a favorite image, or describe somewhere you’d love to be.
                      <br />
                      Your next background will be saved right here.
                    </p>
                    <button className="button secondary" onClick={() => openGenerator()}>
                      <Sparkles size={15} />
                      Dream up your first scene
                    </button>
                  </div>
                )}
              </section>
            </>
          )}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {(
          [
            { id: "focus", icon: Timer, label: "Focus" },
            { id: "tasks", icon: ListTodo, label: "Tasks" },
            { id: "insights", icon: BarChart3, label: "Growth" },
            { id: "backgrounds", icon: ImageIcon, label: "Scenes" },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            onClick={() => go(item.id)}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
        <button onClick={() => setDialog("settings")}>
          <Settings2 size={20} />
          <span>Settings</span>
        </button>
      </nav>
      {dialog === "themes" && (
        <Modal
          title="A little more you."
          subtitle="Pick a palette that feels like home."
          onClose={() => setDialog(null)}
        >
          <div className="theme-options">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className={`theme-option ${preferences.theme === t.id ? "active" : ""}`}
                onClick={() => void chooseTheme(t.id)}
              >
                <span className="theme-swatch" style={{ background: t.color }}>
                  {preferences.theme === t.id && <Check size={17} />}
                </span>
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.description}</small>
                </span>
                {preferences.theme === t.id && <span className="theme-active">Your palette</span>}
              </button>
            ))}
          </div>
          <p className="modal-footnote">
            <Leaf size={14} />A new mood, whenever you need it. Your choice is saved.
          </p>
        </Modal>
      )}
      {dialog === "settings" && (
        <Modal
          wide
          title="Settle into your rhythm."
          subtitle="A few little things to make this space your own."
          onClose={() => setDialog(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSaving(true);
              void attempt(async () => {
                await workspace.updatePreferences(draft);
                notify("Your rhythm, saved. Make yourself at home.");
                setDialog(null);
              }).finally(() => setSaving(false));
            }}
          >
            <div className="settings-section">
              <div className="settings-section-heading">
                <Timer size={17} />
                <h3>Your focus rhythm</h3>
              </div>
              <RhythmInputs
                value={draft}
                onChange={(rhythm) => setDraft({ ...draft, ...rhythm })}
              />
              <label className="goal-input">
                Your daily focus intention
                <div>
                  <input
                    aria-label="Daily focus goal"
                    type="number"
                    min={15}
                    max={720}
                    required
                    value={draft.dailyGoal}
                    onChange={(e) => setDraft({ ...draft, dailyGoal: Number(e.target.value) })}
                  />
                  <span>min / day</span>
                </div>
              </label>
              <label className="toggle-row">
                <span>
                  <strong>Flow into the next session</strong>
                  <small>Automatically start the next focus or break.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.autoStart}
                  onChange={(e) => setDraft({ ...draft, autoStart: e.target.checked })}
                />
              </label>
              <label className="toggle-row">
                <span>
                  <strong>Sound effects</strong>
                  <small>
                    Soft tones for timer controls, completed tasks, and session endings.
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.sound}
                  onChange={(e) => setDraft({ ...draft, sound: e.target.checked })}
                />
              </label>
            </div>
            <div className="settings-section">
              <div className="settings-section-heading">
                <Maximize2 size={17} />
                <h3>Your focus space</h3>
              </div>
              <label className="toggle-row">
                <span>
                  <strong>Open fullscreen automatically</strong>
                  <small>Fill the screen when you start or resume the timer.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.autoFullscreen}
                  onChange={(e) => setDraft({ ...draft, autoFullscreen: e.target.checked })}
                />
              </label>
              <fieldset className="progress-options">
                <legend>Time remaining display</legend>
                <p>A quiet way to see how much time is left.</p>
                <div>
                  {(
                    [
                      { value: "ring", label: "Ring" },
                      { value: "bar", label: "Progress bar" },
                      { value: "none", label: "Off" },
                    ] as const
                  ).map((option) => (
                    <label key={option.value}>
                      <input
                        type="radio"
                        name="timerProgress"
                        value={option.value}
                        checked={draft.timerProgress === option.value}
                        onChange={() => setDraft({ ...draft, timerProgress: option.value })}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="toggle-row">
                <span>
                  <strong>Animate the countdown</strong>
                  <small>Smoothly animate the ring or bar as time passes.</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.animateProgress}
                  disabled={draft.timerProgress === "none"}
                  onChange={(e) => setDraft({ ...draft, animateProgress: e.target.checked })}
                />
              </label>
            </div>
            <div className="settings-section">
              <div className="settings-section-heading">
                <Palette size={17} />
                <h3>Your color palette</h3>
              </div>
              <div className="settings-themes">
                {THEMES.map((t) => (
                  <button
                    type="button"
                    key={t.id}
                    aria-label={`${t.name} theme`}
                    className={draft.theme === t.id ? "active" : ""}
                    onClick={() => setDraft({ ...draft, theme: t.id })}
                  >
                    <span style={{ background: t.color }}>
                      {draft.theme === t.id && <Check size={15} />}
                    </span>
                    <small>{t.name}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-section integrations">
              <div className="settings-section-heading">
                <Sprout size={17} />
                <h3>Your connected little world</h3>
              </div>
              <div className="integration-row">
                <span className="integration-icon auth-icon">
                  <LogIn size={19} />
                </span>
                <div>
                  <strong>{user ? user.name : "Your Pom account"}</strong>
                  <small>
                    {user ? "Signed in with Auth0" : "Sign in to sync across your devices"}
                  </small>
                </div>
                {user ? (
                  <a className="button small-button secondary" href="/auth/logout">
                    Sign out
                  </a>
                ) : (
                  <a className="button small-button secondary" href="/auth/login" onClick={signIn}>
                    {services.auth ? "Sign in" : "Setup needed"}
                    <ArrowUpRight size={12} />
                  </a>
                )}
              </div>
              <div className="integration-row">
                <span className="integration-icon">
                  <TodoistIcon size={22} />
                </span>
                <div>
                  <strong>Todoist</strong>
                  <small>
                    {todoistConnected
                      ? "Connected · complete tasks in either app"
                      : "Bring your tasks into your focus space"}
                  </small>
                </div>
                <button
                  type="button"
                  className="button small-button secondary"
                  onClick={() => {
                    if (!user) {
                      notify("Sign in with Auth0 first to connect Todoist.");
                      return;
                    }
                    if (!services.todoist || !services.database) {
                      notify("Todoist isn’t configured for this workspace yet.");
                      return;
                    }
                    window.location.assign("/api/todoist/connect");
                  }}
                >
                  {todoistConnected ? "Reconnect" : "Connect"}
                  <ArrowUpRight size={12} />
                </button>
              </div>
              <div className="service-statuses">
                <span>
                  <i className={services.database ? "connected" : ""} />
                  {services.database ? "Cloud storage ready" : "Local storage"}
                </span>
                <span>
                  <i className={services.ai ? "connected" : ""} />
                  {services.ai ? "OpenRouter ready" : "AI setup needed"}
                </span>
              </div>
              {(!services.auth || !services.database || !services.ai || !services.todoist) && (
                <p className="setup-note">
                  Your guest space is ready to use. Cloud sync, AI scenes, and Todoist will become
                  available when these services are connected to your workspace.
                </p>
              )}
            </div>
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setDialog(null)}>
                Keep things as they are
              </button>
              <button className="button primary" type="submit" disabled={saving}>
                {saving ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}Save my
                rhythm
              </button>
            </div>
          </form>
        </Modal>
      )}
      {dialog === "import-tasks" && (
        <TaskImportDialog
          onClose={() => setDialog(null)}
          onImport={workspace.syncTodoist}
          importedIds={tasks.filter((task) => task.source === "todoist").map((task) => task.id)}
        />
      )}
      {dialog === "generate" && (
        <Modal
          title={editingBackground ? "Reimagine your scene." : "Dream up a little escape."}
          subtitle={
            editingBackground
              ? "Create a new version of this scene. All previous versions stay together, ready to choose again."
              : "Describe a place that makes you want to sit down and begin."
          }
          onClose={() => {
            if (!generating) setDialog(null);
          }}
        >
          <div className={`generation-preview ${generating ? "is-generating" : ""}`}>
            <div
              className="generation-scenery"
              style={{
                backgroundImage: `linear-gradient(0deg,rgba(12,27,16,.45),rgba(12,27,16,.25)),url("${editingBackground?.url || sceneUrl}")`,
              }}
              aria-hidden="true"
            />
            {generating && (
              <div className="generation-glow" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
            <div className="generation-preview-content">
              <div className="generation-symbol" aria-hidden="true">
                {generating && (
                  <>
                    <span className="generation-orbit" />
                    <span className="generation-orbit" />
                  </>
                )}
                <Sparkles size={28} strokeWidth={1} />
              </div>
              <p className="generation-message" role="status" aria-live="polite">
                {generating
                  ? "Your little escape is taking shape"
                  : "Your next happy place starts here."}
                {generating && (
                  <span className="generation-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </p>
              {generating && (
                <span className="generation-caption">A little imagination. A little patience.</span>
              )}
            </div>
            {generating && (
              <div className="generation-progress" aria-hidden="true">
                <span />
              </div>
            )}
          </div>
          <form
            aria-busy={generating}
            onSubmit={(e) => {
              e.preventDefault();
              if (generating) return;
              if (!user || !services.ai || !services.database) {
                notify(
                  !user
                    ? "Sign in to create and save your own backgrounds."
                    : "Image generation isn’t connected to this workspace yet.",
                );
                return;
              }
              setGenerating(true);
              void attempt(async () => {
                const b = await workspace.generate(prompt, editingBackground?.id);
                await workspace.updatePreferences({ ...preferences, background: b.id });
                notify("Your little escape is ready, and saved to your library.");
                setDialog(null);
                go("focus");
              }).finally(() => setGenerating(false));
            }}
          >
            <label className="prompt-label" htmlFor="scene-prompt">
              Where would you like to be?
            </label>
            <textarea
              id="scene-prompt"
              placeholder="A sunlit reading nook in a tiny cabin, overlooking a quiet lake. Warm wood, a cup of tea, and nowhere else to be…"
              value={prompt}
              minLength={8}
              maxLength={1000}
              required
              onChange={(e) => setPrompt(e.target.value)}
              disabled={generating}
            />
            <div className="prompt-ideas">
              {[
                "A rainy Kyoto café",
                "A library among the clouds",
                "A sunlit wildflower meadow",
              ].map((p) => (
                <button key={p} type="button" disabled={generating} onClick={() => setPrompt(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className="generation-note">
              <Leaf size={15} />
              <p>
                {generating
                  ? "Good things take a little time. Your scene is coming to life…"
                  : "Made just for you. Automatically saved, ready for your next session."}
              </p>
            </div>
            {(!user || !services.ai || !services.database) && (
              <div className="generation-setup">
                <span>
                  {!user
                    ? "A personal scene needs a personal account."
                    : "Image generation isn’t connected to this workspace yet."}
                </span>
                <button type="button" className="text-link" onClick={() => setDialog("settings")}>
                  Open settings
                  <ArrowUpRight size={13} />
                </button>
              </div>
            )}
            <button
              type="submit"
              className="button primary generate-submit"
              disabled={generating || prompt.trim().length < 8}
            >
              {generating ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{" "}
              {generating
                ? "Creating your happy place…"
                : editingBackground
                  ? "Create revised scene"
                  : "Bring it to life"}
            </button>
            <p className="powered-by">
              Powered by OpenRouter · Uses your account’s image generation credits
            </p>
          </form>
        </Modal>
      )}
      {dialog === "versions" && versionBackground && (
        <BackgroundVersions
          background={versionBackground}
          onClose={() => setDialog(null)}
          onSelect={async (versionId) => {
            await workspace.chooseBackgroundVersion(versionBackground.id, versionId);
            await workspace.updatePreferences({ ...preferences, background: versionBackground.id });
            setDialog(null);
            go("focus");
          }}
        />
      )}
      {dialog === "help" && (
        <Modal
          title="Little steps. You’ve got this."
          subtitle="There’s no perfect way to begin. Here’s one gentle rhythm."
          onClose={() => setDialog(null)}
        >
          <div className="help-steps">
            {[
              {
                icon: ListTodo,
                title: "Choose one little thing",
                text: "Add a task, or connect Todoist to import your list. Click a task to make it your focus.",
              },
              {
                icon: Timer,
                title: "Give it a little time",
                text: `Start with ${preferences.focus} minutes of focus, followed by a ${preferences.rest}-minute breather. Make the timing your own on the dashboard.`,
              },
              {
                icon: Coffee,
                title: "Make room to rest",
                text: `After ${preferences.sessionsBeforeLongBreak} focus ${preferences.sessionsBeforeLongBreak === 1 ? "session" : "sessions"}, take a longer ${preferences.longRest}-minute break. Your timer keeps time even if you switch tabs.`,
              },
              {
                icon: Sprout,
                title: "Watch your effort grow",
                text: "Visit My growth to see your daily, weekly, and monthly focus time and completed tasks.",
              },
            ].map((s, i) => (
              <div key={s.title}>
                <span>
                  <s.icon size={21} />
                </span>
                <div>
                  <strong>
                    {i + 1}. {s.title}
                  </strong>
                  <p>{s.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="modal-footnote">
            Guest activity stays on this device. Sign in to a connected workspace to sync.
          </p>
        </Modal>
      )}
      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">
        <Sprout size={18} />
        <span>{toast}</span>
        <button onClick={() => setToast("")} aria-label="Dismiss notification">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
