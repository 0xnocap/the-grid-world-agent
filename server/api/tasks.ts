import type { FastifyInstance } from 'fastify';
import { getWorkspaceManager } from '../workspace.js';
import { CreateTaskSchema, AssignAgentsSchema } from '../types.js';

export async function registerTaskRoutes(fastify: FastifyInstance): Promise<void> {
  const workspace = () => getWorkspaceManager();

  // Create a task
  fastify.post('/api/tasks', async (request, reply) => {
    const parsed = CreateTaskSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    const task = workspace().createTask(parsed.data);
    return reply.code(201).send(task);
  });

  // List all tasks
  fastify.get('/api/tasks', async () => {
    return workspace().getTasks();
  });

  // Get single task
  fastify.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const task = workspace().getTask(request.params.id);
    if (!task) {
      return reply.code(404).send({ error: 'Task not found' });
    }
    return task;
  });

  // Assign agents to a zone/task
  fastify.post('/api/assign', async (request, reply) => {
    const parsed = AssignAgentsSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    workspace().assignAgentsToZone(parsed.data.agentIds, parsed.data.zoneId);
    return { status: 'assigned' };
  });
}
