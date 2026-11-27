"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Moon, Sun } from "lucide-react";

type ThemeMode = "light" | "dark";
type OverlayPhase = "entering" | "visible" | "exiting";

interface OverlayState {
  targetTheme: ThemeMode;
  phase: OverlayPhase;
}

interface ThemeContextValue {
  theme: ThemeMode;
  isTransitioning: boolean;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  isTransitioning: false,
  toggleTheme: () => { },
});

const STORAGE_KEY = "aliems-theme";

function commitThemeToDom(next: ThemeMode) {
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Ignore storage write issues
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const transitioningRef = useRef(false);

  const clearScheduled = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  useEffect(() => {
    const attr = document.documentElement.dataset.theme;
    if (attr === "dark" || attr === "light") {
      setTheme(attr);
    } else {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      const resolved: ThemeMode =
        stored === "dark" || stored === "light"
          ? stored
          : window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light";
      document.documentElement.dataset.theme = resolved;
      setTheme(resolved);
    }

    return () => {
      clearScheduled();
      document.documentElement.classList.remove("theme-instant-swap");
    };
  }, [clearScheduled]);

  const toggleTheme = useCallback(() => {
    if (transitioningRef.current) return;

    const next: ThemeMode = theme === "light" ? "dark" : "light";

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      commitThemeToDom(next);
      setTheme(next);
      return;
    }

    transitioningRef.current = true;
    clearScheduled();

    // Step 1 (0ms – 250ms): Mount entering state, then trigger smooth fade & scale-in on next frame
    setOverlay({ targetTheme: next, phase: "entering" });

    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = window.requestAnimationFrame(() => {
        setOverlay({ targetTheme: next, phase: "visible" });
      });
    });

    // Step 2 (~300ms, while screen is fully covered): Switch theme underneath without blink
    const swapTimer = window.setTimeout(() => {
      document.documentElement.classList.add("theme-instant-swap");
      commitThemeToDom(next);
      setTheme(next);
      window.requestAnimationFrame(() => {
        document.documentElement.classList.remove("theme-instant-swap");
      });
    }, 300);

    // Step 3 (300ms – 650ms) -> Step 4 (650ms – 950ms): Fade out & scale upward
    const exitTimer = window.setTimeout(() => {
      setOverlay({ targetTheme: next, phase: "exiting" });
    }, 650);

    const finishTimer = window.setTimeout(() => {
      setOverlay(null);
      transitioningRef.current = false;
    }, 950);

    timersRef.current = [swapTimer, exitTimer, finishTimer];
  }, [theme, clearScheduled]);

  const isTransitioning = overlay !== null;

  return (
    <ThemeContext.Provider value={{ theme, isTransitioning, toggleTheme }}>
      {children}

      {overlay && (
        <div
          aria-live="polite"
          aria-label={
            overlay.targetTheme === "dark"
              ? "Switching to Dark Mode"
              : "Switching to Light Mode"
          }
          className={`theme-overlay ${overlay.targetTheme === "dark"
              ? "theme-overlay--dark"
              : "theme-overlay--light"
            } ${overlay.phase === "entering"
              ? "theme-overlay--entering"
              : overlay.phase === "visible"
                ? "theme-overlay--visible"
                : "theme-overlay--exiting"
            }`}
        >
          <div className="theme-overlay-content max-w-full px-4">
            <div className="theme-overlay-badge h-14 w-14 sm:h-16 sm:w-16">
              {overlay.targetTheme === "dark" ? (
                <Moon className="h-6 w-6 text-[#5ec2d6] sm:h-7 sm:w-7" strokeWidth={1.75} />
              ) : (
                <Sun className="h-6 w-6 text-[#b45309] sm:h-7 sm:w-7" strokeWidth={1.75} />
              )}
            </div>

            <div className="space-y-1">
              <div className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {overlay.targetTheme === "dark" ? "Dark mode" : "Light mode"}
              </div>
              <p
                className={`text-xs ${overlay.targetTheme === "dark"
                    ? "text-slate-400"
                    : "text-slate-500"
                  }`}
              >
                Workspace theme updated
              </p>
            </div>
          </div>
        </div>
      )}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle({
  showLabelAlways = false,
  className = "",
}: {
  showLabelAlways?: boolean;
  className?: string;
} = {}) {
  const { theme, isTransitioning, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      disabled={isTransitioning}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className={`neu-btn inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-medium text-ink sm:h-9 sm:min-h-[36px] sm:min-w-0 sm:px-2.5 ${className}`}
    >
      <span className="relative flex h-4 w-4 items-center justify-center overflow-hidden">
        <Sun
          className={`theme-icon-item absolute h-3.5 w-3.5 text-warning-icon ${isDark
              ? "rotate-0 scale-100 opacity-100"
              : "-rotate-90 scale-50 opacity-0"
            }`}
        />
        <Moon
          className={`theme-icon-item absolute h-3.5 w-3.5 text-accent ${isDark
              ? "rotate-90 scale-50 opacity-0"
              : "rotate-0 scale-100 opacity-100"
            }`}
        />
      </span>
      <span className={showLabelAlways ? "inline" : "hidden sm:inline"}>
        {isDark ? "Light Mode" : "Dark Mode"}
      </span>
    </button>
  );
}
