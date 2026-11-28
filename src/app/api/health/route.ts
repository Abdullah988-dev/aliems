import { NextResponse } from "next/server";
import { getDb, getStorageMode } from "@/lib/db";
import { enforceApiRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const limited = enforceApiRateLimit(request, "health", 60, 60 * 1000);
  if (limited) return limited;

  try {
    await getDb();
    return NextResponse.json({
      status: "ok",
      app: "AliEMS",
      storageMode: getStorageMode(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "error",
        app: "AliEMS",
      },
      { status: 500 },
    );
  }
}
