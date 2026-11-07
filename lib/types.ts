export type Theme = "sage" | "rose" | "sand" | "lavender" | "midnight";
export type Preferences = {
  focus: number;
  rest: number;
  longRest: number;
  sessionsBeforeLongBreak: number;
  theme: Theme;
  background: string;
  dailyGoal: number;
  autoStart: boolean;
  sound: boolean;
  autoFullscreen: boolean;
  timerProgress: "ring" | "bar" | "none";
  animateProgress: boolean;
};
export type Task = {
  id: string;
  title: string;
  project: string;
  completed: boolean;
  completedAt?: string;
  source: "local" | "todoist";
  due?: string;
  priority: number;
};
export type FocusSession = {
  id: string;
  startedAt: string;
  endedAt: string;
  seconds: number;
  completed: boolean;
  taskId?: string;
};
export type TaskCompletion = { id: string; taskId: string; title: string; completedAt: string };
export type BackgroundVersion = {
  id: string;
  prompt: string;
  url: string;
  createdAt: string;
};
export type Background = {
  id: string;
  name: string;
  prompt: string;
  url: string;
  createdAt: string;
  source?: "ai" | "upload";
  versions?: BackgroundVersion[];
  selectedVersionId?: string;
};
export type Workspace = {
  preferences: Preferences;
  tasks: Task[];
  completions: TaskCompletion[];
  sessions: FocusSession[];
  backgrounds: Background[];
};
export type User = { id: string; name: string; email?: string; picture?: string };
export type ServiceStatus = { auth: boolean; database: boolean; ai: boolean; todoist: boolean };
export type TimerState = {
  mode: "focus" | "rest" | "longRest";
  remaining: number;
  running: boolean;
  endsAt: number | null;
  id: string;
  startedAt: string | null;
  elapsed: number;
  taskId?: string;
  round: number;
};

export const DEFAULT_PREFERENCES: Preferences = {
  focus: 30,
  rest: 5,
  longRest: 15,
  sessionsBeforeLongBreak: 4,
  theme: "sage",
  background: "forest",
  dailyGoal: 120,
  autoStart: false,
  sound: true,
  autoFullscreen: true,
  timerProgress: "ring",
  animateProgress: true,
};
export const THEMES: { id: Theme; name: string; color: string; description: string }[] = [
  { id: "sage", name: "Sage", color: "#687b62", description: "A breath of fresh air" },
  { id: "sand", name: "Oat milk", color: "#b39670", description: "Soft, warm, and grounded" },
  { id: "rose", name: "Rose", color: "#b47e87", description: "A softer kind of focus" },
  { id: "lavender", name: "Lavender", color: "#9184af", description: "A little room to dream" },
  {
    id: "midnight",
    name: "After hours",
    color: "#434c65",
    description: "For your quiet late nights",
  },
];
export const SCENES = [
  {
    id: "forest",
    name: "Quiet forest",
    subtitle: "Somewhere to slow down",
    url: "/images/forest.jpg",
    color: "#687b62",
  },
  {
    id: "coast",
    name: "Ocean air",
    subtitle: "Let your thoughts flow",
    url: "/images/coast.jpg",
    color: "#789aa2",
  },
  {
    id: "mountain",
    name: "Higher ground",
    subtitle: "One small step at a time",
    url: "/images/mountain.jpg",
    color: "#8c9298",
  },
  {
    id: "dunes",
    name: "Golden hour",
    subtitle: "Find your own rhythm",
    url: "/images/dunes.jpg",
    color: "#bc9672",
  },
];
export const emptyWorkspace = (): Workspace => ({
  preferences: { ...DEFAULT_PREFERENCES },
  tasks: [],
  completions: [],
  sessions: [],
  backgrounds: [],
});
