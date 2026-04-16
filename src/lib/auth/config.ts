export const userRoles = ["owner", "admin", "supervisor", "cleaner"] as const;

export type UserRole = (typeof userRoles)[number];

export const roleHomePaths: Record<UserRole, string> = {
  owner: "/dashboard",
  admin: "/dashboard",
  supervisor: "/dashboard",
  cleaner: "/jobs",
};

const protectedRouteRules = [
  {
    prefix: "/dashboard",
    roles: ["owner", "admin", "supervisor"] as UserRole[],
  },
  {
    prefix: "/jobs",
    roles: ["owner", "admin", "supervisor", "cleaner"] as UserRole[],
  },
] as const;

export function isUserRole(value: string | null | undefined): value is UserRole {
  return userRoles.includes(value as UserRole);
}

export function isAdminRole(role: string | null | undefined) {
  return role === "owner" || role === "admin" || role === "supervisor";
}

export function getRequiredRoles(pathname: string) {
  const matchedRule = protectedRouteRules.find((rule) =>
    pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`),
  );

  return matchedRule?.roles ?? null;
}

export function getRoleHomePath(role: UserRole) {
  return roleHomePaths[role];
}

