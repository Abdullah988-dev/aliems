import { NextResponse } from "next/server";
import { getDb, getStorageMode } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    const demoTenants = await db.listDemoTenants();
    return NextResponse.json({
      status: "ok",
      app: "AliEMS",
      storageMode: getStorageMode(),
      demoTenants,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: "error",
        storageMode: getStorageMode(),
        error: err instanceof Error ? err.message : "Database check failed",
      },
      { status: 500 },
    );
  }
}

