import { z } from "zod";

export const realtimeInvalidationSchema = z.object({
  event_id: z.uuid(),
  resource_id: z.uuid(),
  revision: z.number().int().positive(),
  mutation_type: z.string().min(1).max(80),
  changed_entity_id: z.uuid().optional(),
}).strict();

export type RealtimeInvalidation = z.infer<typeof realtimeInvalidationSchema>;
