import { z } from "zod";
export const preferencesSchema = z.object({
  focus: z.number().int().min(1).max(180),
  rest: z.number().int().min(1).max(60),
  longRest: z.number().int().min(1).max(90),
  sessionsBeforeLongBreak: z.number().int().min(1).max(12).default(4),
  theme: z.enum(["sage", "sand", "rose", "lavender", "midnight"]),
  background: z.string().min(1).max(100),
  dailyGoal: z.number().int().min(15).max(720),
  autoStart: z.boolean(),
  sound: z.boolean(),
  autoFullscreen: z.boolean().default(true),
  timerProgress: z.enum(["ring", "bar", "none"]).default("ring"),
  animateProgress: z.boolean().default(true),
});
export const taskSchema = z.object({
  title: z.string().trim().min(1, "Give your task a name.").max(200),
  project: z.string().trim().max(80).default("Personal"),
  priority: z.number().int().min(1).max(4).default(1),
});
export const sessionSchema = z
  .object({
    id: z.uuid(),
    startedAt: z.iso.datetime(),
    endedAt: z.iso.datetime(),
    seconds: z.number().int().min(1).max(14400),
    completed: z.boolean(),
    taskId: z.string().max(100).optional(),
    status: z.enum(["active", "finished"]).default("finished"),
  })
  .refine((s) => s.status !== "active" || !s.completed, "An active session cannot be completed.")
  .refine((s) => {
    const start = new Date(s.startedAt).getTime(),
      end = new Date(s.endedAt).getTime();
    return end >= start && end <= Date.now() + 10_000 && s.seconds <= (end - start) / 1000 + 2;
  }, "Session time must match the time you actually focused.");
