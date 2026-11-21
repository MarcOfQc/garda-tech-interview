import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { BookingFailure, bookAgent } from "../application/book-agent.js";
import type { ScheduleStore } from "../application/schedule-store.js";
import { findAvailableAgents } from "../domain/availability.js";

const shiftParams = z.object({ id: z.string() });
const availableAgentSchema = z.object({ id: z.string(), name: z.string() });
const assignmentSchema = z.object({ id: z.string(), shiftId: z.string(), agentId: z.string() });
const errorSchema = z.object({ message: z.string() });

export function buildApp(store: ScheduleStore, options: FastifyServerOptions = {}) {
  const app = Fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.get(
    "/api/shifts/:id/available-agents",
    {
      schema: {
        params: shiftParams,
        response: { 200: z.array(availableAgentSchema), 404: errorSchema },
      },
    },
    async (request, reply) => {
      const schedule = store.loadShiftSchedule(request.params.id);
      if (!schedule) {
        return reply.code(404).send({ message: `Shift ${request.params.id} not found` });
      }

      return findAvailableAgents(schedule.shift, schedule.data).map(({ id, name }) => ({ id, name }));
    },
  );

  app.post(
    "/api/shifts/:id/assignments",
    {
      schema: {
        params: shiftParams,
        body: z.object({ agentId: z.string().min(1) }),
        response: { 201: assignmentSchema, 404: errorSchema, 409: errorSchema, 422: errorSchema },
      },
    },
    async (request, reply) => {
      const { id: shiftId } = request.params;
      const { agentId } = request.body;
      const result = bookAgent(store, shiftId, agentId);

      if (result.ok) return reply.code(201).send(result.assignment);

      switch (result.reason) {
        case BookingFailure.ShiftNotFound:
          return reply.code(404).send({ message: `Shift ${shiftId} not found` });
        case BookingFailure.AgentNotFound:
          return reply.code(404).send({ message: `Agent ${agentId} not found` });
        case BookingFailure.ShiftFull:
          return reply.code(409).send({ message: `Shift ${shiftId} is full` });
        case BookingFailure.AgentUnavailable:
          return reply.code(422).send({ message: `Agent ${agentId} is not available for shift ${shiftId}` });
        default:
          return result.reason satisfies never;
      }
    },
  );

  return app;
}
