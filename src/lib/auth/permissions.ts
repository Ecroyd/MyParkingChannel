export type UserRole = 'owner' | 'admin' | 'ops' | 'user';

/**
 * Access breadth only. Money visibility is a separate axis
 * (ROLES_WITHOUT_FINANCIALS) so that raising a role's breadth can never silently
 * grant it access to financial figures.
 */
const ROLE_RANK: Record<UserRole, number> = {
  user: 1,
  ops: 2,
  admin: 3,
  owner: 4,
};

/**
 * Roles that must never see revenue, payouts, pricing values or per-booking
 * amounts. Enforced independently of ROLE_RANK: if `ops` is later given wider
 * breadth, money stays hidden unless it is removed from this list.
 */
const ROLES_WITHOUT_FINANCIALS: readonly UserRole[] = ['user', 'ops'];

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  ops: 'Operations',
  user: 'Staff',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  owner: 'Full access including billing, API keys and ownership transfer.',
  admin: 'Full access to operations, settings and financial reporting.',
  ops: 'Dashboard, bookings, imports and gate control. No settings, no money amounts.',
  user: 'Day-to-day bookings access only. No money amounts.',
};

/** Roles an owner or admin may assign to someone else. `owner` transfers separately. */
export const ASSIGNABLE_ROLES = ['admin', 'ops', 'user'] as const satisfies readonly UserRole[];

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && value in ROLE_RANK;
}

/**
 * Coerces a raw `user_tenants.role` value into a known role. Unrecognised values
 * fall back to the least privileged role so a bad row can never widen access.
 */
export function normalizeRole(value: unknown): UserRole {
  if (isUserRole(value)) return value;
  // Legacy/alias values seen in older rows and helpers.
  if (value === 'manager' || value === 'operations' || value === 'staff') return 'ops';
  return 'user';
}

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minimum] ?? 0);
}

export function canViewBookings(role: UserRole): boolean {
  return roleAtLeast(role, 'user');
}

/**
 * The single gate for every monetary figure: revenue, payouts, Stripe state and
 * per-booking amounts. UI and API guards must both use this so hiding a value on
 * screen is never contradicted by an endpoint that still returns it.
 */
export function canViewFinancials(role: UserRole): boolean {
  return roleAtLeast(role, 'admin') && !ROLES_WITHOUT_FINANCIALS.includes(role);
}

/** Alias for readability at money render sites. */
export function canViewMoney(role: UserRole): boolean {
  return canViewFinancials(role);
}

export function canViewAnalytics(role: UserRole): boolean {
  return canViewFinancials(role);
}

export function canManageSettings(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canManageMembers(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function isOwner(role: UserRole): boolean {
  return role === 'owner';
}

export function canManagePricing(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canManageIntegrations(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canManageDevices(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canManageBilling(role: UserRole): boolean {
  return isOwner(role);
}

export function canManageApiKeys(role: UserRole): boolean {
  return isOwner(role);
}

export function canDeleteTenant(role: UserRole): boolean {
  return isOwner(role);
}

export function canTransferOwnership(role: UserRole): boolean {
  return isOwner(role);
}

// Legacy alias for backward compatibility
export function requireRoleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return roleAtLeast(role, minimum);
}
