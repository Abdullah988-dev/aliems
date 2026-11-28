"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/AuthGuard";
import { DashboardShell, type DashboardTab } from "@/components/DashboardShell";
import type { TenantOverview } from "@/types/domain";

interface DashboardRouteClientProps {
  initialOverview: TenantOverview;
  initialTab?: DashboardTab;
}

export function DashboardRouteClient({
  initialOverview,
  initialTab = "overview",
}: DashboardRouteClientProps) {
  const router = useRouter();
  const [overview, setOverview] = useState<TenantOverview | null>(initialOverview);

  return (
    <AuthGuard overview={overview} loginRedirect="/login">
      {overview ? (
        <DashboardShell
          overview={overview}
          initialTab={initialTab}
          onOverviewUpdate={(next) => setOverview(next)}
          onLoggedOut={() => {
            setOverview(null);
            router.replace("/login");
            router.refresh();
          }}
        />
      ) : null}
    </AuthGuard>
  );
}
