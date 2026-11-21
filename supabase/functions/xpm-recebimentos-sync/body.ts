import { z } from "npm:zod@3";

export const BodySchema = z.object({
  dias: z.number().int().positive().safe().default(60),
  ids: z.array(z.number().int().positive().safe()).optional(),
}).strict();