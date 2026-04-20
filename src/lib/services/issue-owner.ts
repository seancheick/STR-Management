export type IssueAssignmentOwnerScope = {
  owner_id: string;
  property_id: string;
};

export function getOwnerIdFromLinkedAssignment(
  assignment: IssueAssignmentOwnerScope,
  propertyId: string,
) {
  if (assignment.property_id !== propertyId) {
    throw new Error("Assignment does not belong to this property.");
  }

  return assignment.owner_id;
}
