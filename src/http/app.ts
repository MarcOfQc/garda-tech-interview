import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import type { ScheduleStore } from "../data/schedule-store.js";
import { findAvailableAgents } from "../domain/availability.js";
import { BookingRejection, checkBooking, nextAssignmentId } from "../domain/booking.js";

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
      const data = store.read();
      const shift = data.shifts.find((s) => s.id === request.params.id);
      if (!shift) {
        return reply.code(404).send({ message: `Shift ${request.params.id} not found` });
      }

      return findAvailableAgents(shift, data).map(({ id, name }) => ({ id, name }));
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
      const data = store.read();

      const shift = data.shifts.find((s) => s.id === shiftId);
      if (!shift) return reply.code(404).send({ message: `Shift ${shiftId} not found` });

      const agent = data.agents.find((a) => a.id === agentId);
      if (!agent) return reply.code(404).send({ message: `Agent ${agentId} not found` });

      const rejection = checkBooking(agent, shift, data);
      if (rejection === BookingRejection.ShiftFull) {
        return reply.code(409).send({ message: `Shift ${shiftId} is full` });
      }
      if (rejection === BookingRejection.AgentUnavailable) {
        return reply.code(422).send({ message: `Agent ${agentId} is not available for shift ${shiftId}` });
      }

      const assignment = { id: nextAssignmentId(data.assignments), shiftId, agentId };
      store.addAssignment(assignment);
      return reply.code(201).send(assignment);
    },
  );

  return app;
}
