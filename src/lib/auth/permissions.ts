export type UserRole = 'owner' | 'admin' | 'user';

const ROLE_ORDER: UserRole[] = ['user', 'admin', 'owner'];

export function roleAtLeast(role: UserRole, minimum: UserRole): boolean {
  return ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(minimum);
}

export function canViewBookings(role: UserRole): boolean {
  return roleAtLeast(role, 'user');
}

export function canViewFinancials(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canViewAnalytics(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canManageSettings(role: UserRole): boolean {
  return roleAtLeast(role, 'admin');
}

export function canManageMembers(role: UserRole): boolean {
  // Option A (strict): only owner
  // return roleAtLeast(role, 'owner');

  // Option B (looser): allow admins too
  return roleAtLeast(role, 'admin');
}

export function isOwner(role: UserRole): boolean {
  return role === 'owner';
}

// Additional helpers for backward compatibility and extended features
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

