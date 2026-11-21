import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { findAvailableAgents } from "../domain/availability.js";
import type { ScheduleData } from "../domain/types.js";

const availableAgentSchema = z.object({ id: z.string(), name: z.string() });
const errorSchema = z.object({ message: z.string() });

export function buildApp(data: ScheduleData, options: FastifyServerOptions = {}) {
  const app = Fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.get(
    "/api/shifts/:id/available-agents",
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: z.array(availableAgentSchema), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const shift = data.shifts.find((s) => s.id === request.params.id);
      if (!shift) {
        return reply.code(404).send({ message: `Shift ${request.params.id} not found` });
      }

      return findAvailableAgents(shift, data).map(({ id, name }) => ({ id, name }));
    },
  );

  return app;
}
