"use client";

import { useRouter } from "next/navigation";
import { AuthOnboarding } from "@/components/AuthOnboarding";
import type { BusinessType } from "@/types/domain";

interface DemoTenantSummary {
  tenantId: string;
  businessName: string;
  businessType: BusinessType;
  email: string;
}

interface AuthRouteClientProps {
  storageMode: "mongodb" | "fallback";
  demoTenants: DemoTenantSummary[];
  initialMode: "login" | "register";
}

export function LoginPageClient({
  storageMode,
  demoTenants,
  initialMode,
}: AuthRouteClientProps) {
  const router = useRouter();

  return (
    <AuthOnboarding
      storageMode={storageMode}
      demoTenants={demoTenants}
      initialMode={initialMode}
      onAuthenticated={() => {
        router.replace("/dashboard");
        router.refresh();
      }}
    />
  );
}

