import { z } from "zod";

import {
  assignmentAckStatuses,
  assignmentActions,
  assignmentStatuses,
} from "@/lib/domain/assignments";

export const assignmentStateSchema = z.object({
  status: z.enum(assignmentStatuses),
  ackStatus: z.enum(assignmentAckStatuses),
});

export const assignmentTransitionContextSchema = assignmentStateSchema.extend({
  action: z.enum(assignmentActions),
  proofChecklistComplete: z.boolean().optional(),
  proofPhotosComplete: z.boolean().optional(),
});

export type AssignmentTransitionContext = z.infer<
  typeof assignmentTransitionContextSchema
>;

