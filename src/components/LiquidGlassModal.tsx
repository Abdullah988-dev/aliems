"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";

interface LiquidGlassModalProps {
  open: boolean;
  title: string;
  description: string;
  details?: Array<{ label: string; value: string }>;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function LiquidGlassModal({
  open,
  title,
  description,
  details = [],
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: LiquidGlassModalProps) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="liquid-glass-backdrop fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="liquid-modal-title"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="liquid-glass-modal max-h-[90vh] w-full max-w-[95vw] overflow-y-auto overscroll-contain p-4 sm:max-w-md sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative z-10 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                  tone === "danger" ? "alert-danger" : "glass-subpanel text-accent"
                }`}
              >
                <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <h3
                  id="liquid-modal-title"
                  className="break-words text-base font-medium text-ink"
                >
                  {title}
                </h3>
              </div>
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              aria-label="Close modal"
              className="neu-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-secondary sm:h-8 sm:w-8"
            >
              <X className="h-4 w-4" strokeWidth={1.75} />
            </button>
          </div>

          <p className="text-sm leading-relaxed text-ink-secondary">{description}</p>

          {details.length > 0 && (
            <div className="glass-subpanel space-y-2 rounded-lg p-3.5 text-xs">
              {details.map((row) => (
                <div
                  key={row.label}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5"
                >
                  <span className="shrink-0 text-ink-muted">{row.label}</span>
                  <span className="tabular-nums break-words text-right font-medium text-ink">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:items-center sm:justify-end sm:gap-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="neu-btn min-h-[44px] w-full rounded-lg px-4 text-sm font-medium text-ink sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={onConfirm}
              className={`min-h-[44px] w-full rounded-lg px-4 text-sm font-medium sm:h-9 sm:min-h-[36px] sm:w-auto sm:text-xs ${
                tone === "danger" ? "neu-btn-danger-solid" : "neu-btn-primary"
              }`}
            >
              {busy ? "Processing..." : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
