"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { TenantOverview } from "@/types/domain";

interface AuthGuardProps {
  overview: TenantOverview | null;
  requiredRole?: "owner" | "operator";
  loginRedirect?: string;
  forbiddenRedirect?: string;
  children: React.ReactNode;
}

export function AuthGuard({
  overview,
  requiredRole,
  loginRedirect = "/login",
  forbiddenRedirect = "/dashboard",
  children,
}: AuthGuardProps) {
  const router = useRouter();
  const isAuthenticated = Boolean(overview?.user?.id && overview?.tenant?.id);
  const hasPermission =
    !requiredRole ||
    overview?.user?.role === requiredRole ||
    overview?.user?.role === "owner";

  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!isAuthenticated) {
      router.replace(loginRedirect);
      return;
    }
    if (!hasPermission) {
      router.replace(forbiddenRedirect);
    }
  }, [isAuthenticated, hasPermission, loginRedirect, forbiddenRedirect, router]);

  if (!isAuthenticated || !hasPermission) {
    return null;
  }

  return <>{children}</>;
}

