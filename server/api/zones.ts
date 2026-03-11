import type { FastifyInstance } from 'fastify';
import { getWorkspaceManager } from '../workspace.js';
import { CreateZoneSchema } from '../types.js';

export async function registerZoneRoutes(fastify: FastifyInstance): Promise<void> {
  const workspace = () => getWorkspaceManager();

  // Create a project zone
  fastify.post('/api/zones', async (request, reply) => {
    const parsed = CreateZoneSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.message });
    }

    const zone = workspace().addZone(parsed.data);
    return reply.code(201).send(zone);
  });

  // List all zones
  fastify.get('/api/zones', async () => {
    return workspace().getZones();
  });

  // Get single zone
  fastify.get<{ Params: { id: string } }>('/api/zones/:id', async (request, reply) => {
    const zone = workspace().getZone(request.params.id);
    if (!zone) {
      return reply.code(404).send({ error: 'Zone not found' });
    }
    return zone;
  });

  // Remove zone
  fastify.delete<{ Params: { id: string } }>('/api/zones/:id', async (request, reply) => {
    const ok = workspace().removeZone(request.params.id);
    if (!ok) {
      return reply.code(404).send({ error: 'Zone not found' });
    }
    return { status: 'removed' };
  });
}
