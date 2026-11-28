export interface FlashToastPayload {
  kind: "success" | "error";
  message: string;
}

const FLASH_TOAST_KEY = "aliems_flash_toast";

export function setFlashToast(payload: FlashToastPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      FLASH_TOAST_KEY,
      JSON.stringify({
        kind: payload.kind,
        message: payload.message,
        expiresAt: Date.now() + 60_000,
      }),
    );
  } catch {
    // Ignore storage unavailability
  }
}

export function consumeFlashToast(): FlashToastPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(FLASH_TOAST_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(FLASH_TOAST_KEY);
    const parsed = JSON.parse(raw) as {
      kind?: string;
      message?: string;
      expiresAt?: number;
    };
    if (
      typeof parsed.message === "string" &&
      parsed.message.trim() &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt >= Date.now()
    ) {
      return {
        kind: parsed.kind === "error" ? "error" : "success",
        message: parsed.message,
      };
    }
  } catch {
    return null;
  }
  return null;
}

