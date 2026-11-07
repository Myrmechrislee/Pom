import { useEffect, useState } from "react";
import { Check, LoaderCircle, Settings2, Timer } from "lucide-react";
import type { Preferences } from "@/lib/types";

type TimerRhythm = Pick<Preferences, "focus" | "rest" | "longRest" | "sessionsBeforeLongBreak">;

export function RhythmInputs({
  value,
  onChange,
}: {
  value: TimerRhythm;
  onChange: (value: TimerRhythm) => void;
}) {
  return (
    <div className="duration-inputs rhythm-inputs">
      {(
        [
          { key: "focus", label: "Focus time", max: 180, unit: "min" },
          { key: "rest", label: "Short break", max: 60, unit: "min" },
          { key: "longRest", label: "Long break", max: 90, unit: "min" },
          {
            key: "sessionsBeforeLongBreak",
            label: "Sessions before a long break",
            max: 12,
            unit: "sessions",
          },
        ] as const
      ).map((item) => (
        <label key={item.key}>
          {item.label}
          <div>
            <input
              aria-label={item.label}
              type="number"
              min={1}
              max={item.max}
              step={1}
              required
              value={value[item.key]}
              onChange={(event) => onChange({ ...value, [item.key]: Number(event.target.value) })}
            />
            <span>{item.unit}</span>
          </div>
        </label>
      ))}
    </div>
  );
}

export default function TimerSettings({
  preferences,
  ready,
  onSave,
  onMoreSettings,
}: {
  preferences: Preferences;
  ready: boolean;
  onSave: (rhythm: TimerRhythm) => Promise<void>;
  onMoreSettings: () => void;
}) {
  const { focus, rest, longRest, sessionsBeforeLongBreak } = preferences;
  const [draft, setDraft] = useState<TimerRhythm>({
    focus,
    rest,
    longRest,
    sessionsBeforeLongBreak,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft({ focus, rest, longRest, sessionsBeforeLongBreak });
  }, [focus, rest, longRest, sessionsBeforeLongBreak]);
  const changed =
    draft.focus !== focus ||
    draft.rest !== rest ||
    draft.longRest !== longRest ||
    draft.sessionsBeforeLongBreak !== sessionsBeforeLongBreak;

  return (
    <section className="timer-settings panel" aria-labelledby="timer-settings-heading">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setSaving(true);
          setError("");
          try {
            await onSave(draft);
          } catch (error) {
            setError(
              error instanceof Error
                ? error.message
                : "Your settings couldn’t be saved. Try again.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <div className="card-heading">
          <div className="card-title">
            <Timer size={17} />
            <h2 id="timer-settings-heading">Your focus rhythm</h2>
          </div>
          <button
            type="button"
            className="text-link"
            onClick={onMoreSettings}
            disabled={!ready || saving}
          >
            <Settings2 size={14} />
            All settings
          </button>
        </div>
        <fieldset disabled={!ready || saving} aria-label="Timer durations and session count">
          <RhythmInputs value={draft} onChange={setDraft} />
        </fieldset>
        <div className="timer-settings-footer">
          <p>New durations apply before a timer starts.</p>
          <button type="submit" className="button primary" disabled={!ready || saving || !changed}>
            {saving ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
            Save timer settings
          </button>
        </div>
        {error && (
          <p className="timer-settings-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </section>
  );
}
