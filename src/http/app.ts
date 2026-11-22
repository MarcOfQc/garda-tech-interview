import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";
import { BookingFailure, bookAgent } from "../application/book-agent.js";
import type { ScheduleStore } from "../application/schedule-store.js";
import { findAvailableAgents } from "../domain/availability.js";

const shiftParams = z.object({ id: z.string().meta({ description: "Shift id", example: "shf_2" }) });
const availableAgentSchema = z.object({ id: z.string(), name: z.string() });
const assignmentSchema = z.object({ id: z.string(), shiftId: z.string(), agentId: z.string() });
const errorSchema = z.object({ message: z.string() });
const validationErrorSchema = z.object({
  statusCode: z.number(),
  code: z.string().optional(),
  error: z.string(),
  message: z.string(),
});

export function buildApp(store: ScheduleStore, options: FastifyServerOptions = {}) {
  const app = Fastify(options).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(fastifySwagger, {
    openapi: {
      info: {
        title: "Shift Scheduling API",
        description: "Books security agents onto shifts.",
        version: "1.0.0",
      },
    },
    transform: jsonSchemaTransform,
  });
  app.register(fastifySwaggerUi, { routePrefix: "/docs" });

  // Routes are added after the Swagger plugin has loaded, so it sees them and documents them.
  app.after(() => {
    app.get(
      "/api/shifts/:id/available-agents",
      {
        schema: {
          summary: "List the agents available for a shift",
          description:
            "An agent is available when they hold every required qualification, none has expired by the shift's start date, and they have no booking on an overlapping shift.",
          tags: ["Shifts"],
          params: shiftParams,
          response: {
            200: z.array(availableAgentSchema).describe("Available agents; empty when nobody is available"),
            404: errorSchema.describe("Unknown shift"),
          },
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
          summary: "Book an agent onto a shift",
          description:
            "Succeeds only when the agent is available for the shift (same rules as the GET) and the shift isn't full. A rejected booking changes nothing.",
          tags: ["Shifts"],
          params: shiftParams,
          body: z.object({ agentId: z.string().min(1).meta({ description: "Agent to book", example: "agt_3" }) }),
          response: {
            201: assignmentSchema.describe("The booking that was created"),
            400: validationErrorSchema.describe("Invalid request body, e.g. missing agentId"),
            404: errorSchema.describe("Unknown shift or unknown agent"),
            409: errorSchema.describe("The shift is full (headcount reached)"),
            422: errorSchema.describe("The agent isn't available for this shift"),
          },
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
  });

  return app;
}
