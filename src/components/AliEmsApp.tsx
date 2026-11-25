"use client";

import { useState } from "react";
import { AuthOnboarding } from "@/components/AuthOnboarding";
import { DashboardShell } from "@/components/DashboardShell";
import type { BusinessType, TenantOverview } from "@/types/domain";

interface DemoTenantSummary {
  tenantId: string;
  businessName: string;
  businessType: BusinessType;
  email: string;
}

interface AliEmsAppProps {
  initialOverview: TenantOverview | null;
  storageMode: "mongodb" | "fallback";
  demoTenants: DemoTenantSummary[];
}

export function AliEmsApp({
  initialOverview,
  storageMode,
  demoTenants,
}: AliEmsAppProps) {
  const [overview, setOverview] = useState<TenantOverview | null>(initialOverview);

  if (!overview) {
    return (
      <AuthOnboarding
        storageMode={storageMode}
        demoTenants={demoTenants}
        onAuthenticated={(next) => setOverview(next)}
      />
    );
  }

  return (
    <DashboardShell
      overview={overview}
      onOverviewUpdate={(next) => setOverview(next)}
      onLoggedOut={() => setOverview(null)}
    />
  );
}

