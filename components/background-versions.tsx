"use client";
import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { backgroundVersions } from "@/lib/backgrounds";
import type { Background } from "@/lib/types";
import Modal from "./modal";

export default function BackgroundVersions({
  background,
  onClose,
  onSelect,
}: {
  background: Background;
  onClose: () => void;
  onSelect: (versionId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const versions = backgroundVersions(background);
  const selectedId = background.selectedVersionId || background.id;

  return (
    <Modal
      title="Choose your version."
      subtitle={`Every version of ${background.name}, kept together. Select one to use in your workspace.`}
      onClose={() => {
        if (!pending) onClose();
      }}
    >
      {error && (
        <p className="version-error" role="alert">
          {error}
        </p>
      )}
      <div className="version-grid" aria-busy={!!pending}>
        {versions.map((version, index) => (
          <button
            key={version.id}
            className={`version-card ${selectedId === version.id ? "active" : ""}`}
            aria-label={`Use version ${index + 1} for ${background.name}`}
            aria-pressed={selectedId === version.id}
            disabled={!!pending}
            onClick={async () => {
              if (pending) return;
              setPending(version.id);
              setError("");
              try {
                await onSelect(version.id);
              } catch (error) {
                setError(
                  error instanceof Error
                    ? error.message
                    : "Couldn’t select this version. Try again.",
                );
              } finally {
                setPending(null);
              }
            }}
          >
            <span className="version-image" style={{ backgroundImage: `url("${version.url}")` }} />
            <span className="version-heading">
              <strong>
                Version {index + 1}
                {index === 0 ? " · Original" : ""}
              </strong>
              {pending === version.id ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                selectedId === version.id && <Check size={15} />
              )}
            </span>
            <span className="version-date">
              {new Date(version.createdAt).toLocaleString("en", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
              {selectedId === version.id ? " · Selected" : ""}
            </span>
            <span className="version-prompt">{version.prompt}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
