import { AppError } from "@/lib/errors";

import { type Action, can, type Member, type PolicyResources } from "./policy";

/**
 * Throws unless the policy allows the action. Non-members get NOT_FOUND so a course's
 * existence is not revealed to people outside it.
 */
export function authorize<A extends Action>(
  member: Member | null | undefined,
  action: A,
  resource: PolicyResources[A],
): asserts member is Member {
  if (can(member, action, resource)) return;
  if (!member) throw new AppError("NOT_FOUND", "Course not found.");
  throw new AppError("FORBIDDEN", "You do not have permission to do that.");
}
