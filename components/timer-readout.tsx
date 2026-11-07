import type { ReactNode } from "react";
import type { Preferences } from "@/lib/types";

export default function TimerReadout({
  remaining,
  total,
  running,
  style,
  animated,
  children,
}: {
  remaining: number;
  total: number;
  running: boolean;
  style: Preferences["timerProgress"];
  animated: boolean;
  children: ReactNode;
}) {
  const duration = Math.max(1, total);
  const left = Math.max(0, Math.min(remaining, duration));
  const seconds = Math.ceil(left);
  const fraction = left / duration;
  const progressProps = {
    role: "progressbar",
    "aria-label": "Time remaining",
    "aria-valuemin": 0,
    "aria-valuemax": Math.ceil(duration),
    "aria-valuenow": Math.ceil(left),
    "aria-valuetext": `${Math.floor(seconds / 60)} minutes ${seconds % 60} seconds remaining`,
  } as const;

  return (
    <div className={`timer-readout timer-readout-${style}`} data-animated={animated && running}>
      {style === "ring" && (
        <svg className="timer-ring" viewBox="0 0 240 240" {...progressProps}>
          <circle className="timer-ring-track" cx="120" cy="120" r="112" />
          <circle
            className="timer-ring-remaining"
            cx="120"
            cy="120"
            r="112"
            pathLength="100"
            strokeDasharray="100"
            strokeDashoffset={100 * (1 - fraction)}
          />
        </svg>
      )}
      {children}
      {style === "bar" && (
        <div className="timer-progress-bar" {...progressProps}>
          <span style={{ transform: `scaleX(${fraction})` }} />
        </div>
      )}
    </div>
  );
}
