/**
 * Tenant scoping helpers.
 * All data access must go through these to enforce multi-tenant isolation.
 */

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: "ADMIN" | "MEMBER" | "VIEWER";
}

export function requireTenantContext(ctx: TenantContext | null): TenantContext {
  if (!ctx?.tenantId || !ctx?.userId) {
    throw new Error("Unauthorized: tenant context required");
  }
  return ctx;
}

export function requireAdmin(ctx: TenantContext): void {
  if (ctx.role !== "ADMIN") {
    throw new Error("Forbidden: admin role required");
  }
}

export function canWrite(ctx: TenantContext): boolean {
  return ctx.role === "ADMIN" || ctx.role === "MEMBER";
}

/** Scope a Prisma where clause to the current tenant. */
export function scopedToTenant<T extends Record<string, unknown>>(
  tenantId: string,
  where: T = {} as T
): T & { tenantId: string } {
  return { ...where, tenantId };
}
