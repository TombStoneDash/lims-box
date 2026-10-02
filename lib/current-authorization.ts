import type { Prisma } from "@prisma/client";

/**
 * A "current" authorization is one that has not been revoked (isActive) AND
 * whose holder has not been deactivated (person.active). An active authorization
 * belonging to an inactive (deactivated) person is not current.
 */
export const CURRENT_AUTHORIZATION_WHERE: Prisma.AuthorizationWhereInput = {
  isActive: true,
  person: { active: true },
};

export function isCurrentAuthorization(authorization: {
  isActive: boolean;
  person: { active: boolean };
}): boolean {
  return authorization.isActive && authorization.person.active;
}
