"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Task } from "@/lib/types";

type DropTarget = { id: string; after: boolean };
type Gesture = {
  id: string;
  x: number;
  y: number;
  startX: number;
  startY: number;
  active: boolean;
  container: HTMLElement;
  target: DropTarget | null;
};

export function useTaskReorder({
  tasks,
  disabled,
  onReorder,
}: {
  tasks: Task[];
  disabled: boolean;
  onReorder: (ids: string[]) => Promise<void>;
}) {
  const instructionsId = useId();
  const gesture = useRef<Gesture | null>(null);
  const animation = useRef<number | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<{
    id: string;
    handle: HTMLButtonElement;
    container: HTMLElement | null;
  } | null>(null);

  const cancel = () => {
    gesture.current = null;
    if (animation.current !== null) cancelAnimationFrame(animation.current);
    animation.current = null;
    setDragging(null);
    setTarget(null);
  };

  useEffect(
    () => () => {
      if (animation.current !== null) cancelAnimationFrame(animation.current);
    },
    [],
  );

  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, []);

  // A completion or filter change can remove rows during a gesture.
  const taskIds = JSON.stringify(tasks.map((task) => task.id));
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending || disabled) return;
    if (document.activeElement === document.body || document.activeElement === pending.handle) {
      pending.container
        ?.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(pending.id)}"] .task-drag-handle`)
        ?.focus({ preventScroll: true });
    }
    pendingFocus.current = null;
  }, [disabled, taskIds, announcement]);
  useEffect(() => {
    cancel();
  }, [taskIds, disabled]);

  const findTarget = (current: Gesture) => {
    const row = document
      .elementFromPoint(current.x, current.y)
      ?.closest<HTMLElement>("[data-task-id]");
    let next: DropTarget | null = null;
    if (row && current.container.contains(row) && row.dataset.taskId !== current.id) {
      const bounds = row.getBoundingClientRect();
      next = { id: row.dataset.taskId!, after: current.y >= bounds.top + bounds.height / 2 };
    }
    if (next?.id !== current.target?.id || next?.after !== current.target?.after) {
      current.target = next;
      setTarget(next);
    }
  };

  const autoScroll = () => {
    const current = gesture.current;
    if (!current?.active) return;
    let scrollable: HTMLElement | null = current.container;
    while (
      scrollable &&
      !(
        scrollable.scrollHeight > scrollable.clientHeight &&
        /auto|scroll/.test(getComputedStyle(scrollable).overflowY)
      )
    ) {
      scrollable = scrollable.parentElement;
    }
    const bounds = scrollable?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const amount = current.y < bounds.top + 40 ? -12 : current.y > bounds.bottom - 40 ? 12 : 0;
    if (amount) {
      if (scrollable) scrollable.scrollTop += amount;
      else window.scrollBy(0, amount);
      findTarget(current);
    }
    animation.current = requestAnimationFrame(autoScroll);
  };

  const save = async (ids: string[], id: string) => {
    try {
      await onReorder(ids);
      setAnnouncement(
        `${tasks.find((task) => task.id === id)?.title} moved to position ${ids.indexOf(id) + 1} of ${ids.length}.`,
      );
    } catch {
      // The owner reports the save error and restores the previous order.
      setAnnouncement("Task order could not be saved. Previous order restored.");
    }
  };

  return {
    instructionsId,
    announcement,
    rowProps: (id: string) => ({
      "data-task-id": id,
      "data-dragging": dragging === id || undefined,
      "data-drop": target?.id === id ? (target.after ? "after" : "before") : undefined,
    }),
    handleProps: (task: Task) => ({
      type: "button" as const,
      className: "task-drag-handle",
      "aria-label": `Reorder ${task.title}`,
      "aria-describedby": instructionsId,
      title: "Drag to reorder, or use the Up and Down arrow keys",
      disabled: disabled || tasks.length < 2,
      onClick: (event: React.MouseEvent<HTMLButtonElement>) => event.preventDefault(),
      onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const ids = tasks.map((entry) => entry.id);
        const index = ids.indexOf(task.id);
        const next = index + (event.key === "ArrowUp" ? -1 : 1);
        if (next < 0 || next >= ids.length) return;
        [ids[index], ids[next]] = [ids[next], ids[index]];
        pendingFocus.current = {
          id: task.id,
          handle: event.currentTarget,
          container: event.currentTarget.closest<HTMLElement>("[data-reorder-list]"),
        };
        void save(ids, task.id);
      },
      onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
        if (event.button !== 0 || !event.isPrimary) return;
        const container = event.currentTarget.closest<HTMLElement>("[data-reorder-list]");
        if (!container) return;
        event.preventDefault();
        event.currentTarget.focus({ preventScroll: true });
        event.currentTarget.setPointerCapture(event.pointerId);
        gesture.current = {
          id: task.id,
          x: event.clientX,
          y: event.clientY,
          startX: event.clientX,
          startY: event.clientY,
          active: false,
          container,
          target: null,
        };
      },
      onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
        const current = gesture.current;
        if (!current) return;
        current.x = event.clientX;
        current.y = event.clientY;
        if (
          !current.active &&
          Math.hypot(current.x - current.startX, current.y - current.startY) >= 5
        ) {
          current.active = true;
          setDragging(current.id);
          animation.current = requestAnimationFrame(autoScroll);
        }
        if (current.active) findTarget(current);
      },
      onPointerUp: () => {
        const current = gesture.current;
        if (current?.active && current.target) {
          const ids = tasks.map((entry) => entry.id).filter((id) => id !== current.id);
          const index = ids.indexOf(current.target.id) + (current.target.after ? 1 : 0);
          ids.splice(index, 0, current.id);
          if (ids.some((id, index) => tasks[index].id !== id)) void save(ids, current.id);
        }
        cancel();
      },
      onPointerCancel: cancel,
      onLostPointerCapture: cancel,
    }),
  };
}
