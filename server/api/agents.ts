import type { FastifyInstance } from 'fastify';
import { getWorkspaceManager } from '../workspace.js';
import { RegisterAgentSchema, UpdateAgentStatusSchema } from '../types.js';

export async function registerAgentRoutes(fastify: FastifyInstance): Promise<void> {
  const workspace = () => getWorkspaceManager();

  // Register a new agent
  fastify.post('/api/agents/register', async (request, reply) => {
    const parsed = RegisterAgentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    const agent = workspace().registerAgent(parsed.data);
    return reply.code(201).send(agent);
  });

  // Update agent status
  fastify.post<{ Params: { id: string } }>('/api/agents/:id/status', async (request, reply) => {
    const parsed = UpdateAgentStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    const agent = workspace().updateAgentStatus(request.params.id, parsed.data);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return agent;
  });

  // Heartbeat
  fastify.post<{ Params: { id: string } }>('/api/agents/:id/heartbeat', async (request, reply) => {
    const ok = workspace().heartbeatAgent(request.params.id);
    if (!ok) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return { status: 'ok' };
  });

  // List all agents
  fastify.get('/api/agents', async () => {
    return workspace().getAgents();
  });

  // Get single agent
  fastify.get<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const agent = workspace().getAgent(request.params.id);
    if (!agent) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return agent;
  });

  // Remove agent
  fastify.delete<{ Params: { id: string } }>('/api/agents/:id', async (request, reply) => {
    const ok = workspace().removeAgent(request.params.id);
    if (!ok) {
      return reply.code(404).send({ error: 'Agent not found' });
    }
    return { status: 'removed' };
  });
}
