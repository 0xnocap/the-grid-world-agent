import type { FastifyInstance } from 'fastify';
import { authenticate } from '../auth.js';
import * as db from '../db.js';
import { getWorldManager } from '../world.js';
import { publishWorkOrderFeedbackOnChain } from '../chain.js';
import { checkRateLimit } from '../throttle.js';
import {
  BUILD_CREDIT_CONFIG,
  CreateBountySchema,
  ClaimBountySchema,
  SubmitBountyClaimSchema,
  VerifyBountyClaimSchema,
  CreateWorkOrderSchema,
  SubmitWorkOrderSchema,
  ConfirmWorkOrderSchema,
  CancelWorkOrderSchema,
} from '../types.js';

// ===========================================
// Granted Tools — In-memory tracking
// ===========================================

const activeBountyGrants = new Map<string, Set<string>>();

export function grantBountyTools(agentId: string, toolIds: string[]) {
  const existing = activeBountyGrants.get(agentId) || new Set();
  toolIds.forEach(t => existing.add(t));
  activeBountyGrants.set(agentId, existing);
}

export function revokeBountyTools(agentId: string, toolIds: string[]) {
  const existing = activeBountyGrants.get(agentId);
  if (!existing) return;
  toolIds.forEach(t => existing.delete(t));
  if (existing.size === 0) activeBountyGrants.delete(agentId);
}

export function agentHasGrantedTool(agentId: string, toolId: string): boolean {
  return activeBountyGrants.get(agentId)?.has(toolId) ?? false;
}

async function rebuildBountyGrants(): Promise<void> {
  const grants = await db.getActiveBountyGrants();
  activeBountyGrants.clear();
  for (const [agentId, tools] of grants) {
    activeBountyGrants.set(agentId, new Set(tools));
  }
  if (activeBountyGrants.size > 0) {
    console.log(`[Bounties] Rebuilt ${activeBountyGrants.size} active bounty grants`);
  }
}

// ===========================================
// Solo Build Auto-Verification
// ===========================================

interface SoloBuildRequirements {
  zone: { centerX: number; centerZ: number; radius: number };
  minStructures: number;
  requiredCategories?: string[];
  requiredBlueprints?: string[];
  minTotalPrimitives?: number;
}

async function verifySoloBuild(
  bounty: db.BountyRow,
  agentId: string
): Promise<{ passed: boolean; details: Record<string, unknown> }> {
  const req = bounty.requirements as unknown as SoloBuildRequirements;
  const claim = await db.getBountyClaim(bounty.id, agentId);
  if (!claim) return { passed: false, details: { error: 'No claim found' } };

  // Get all primitives placed by this agent
  const agentBuilds = await db.getAgentBuilds(agentId) as Array<{
    x: number; z: number; category?: string; blueprint_name?: string;
    created_at: string | number; id: string; blueprint_instance_id?: string;
  }>;

  // Filter to builds within the target zone
  const inZone = agentBuilds.filter(b =>
    Math.hypot((b.x ?? 0) - req.zone.centerX, (b.z ?? 0) - req.zone.centerZ) <= req.zone.radius
  );

  // Count unique structures (by blueprint_instance_id or individual primitives)
  const structureIds = new Set(inZone.map(b => b.blueprint_instance_id || b.id));
  const structureCount = structureIds.size;
  const structurePass = structureCount >= req.minStructures;

  // Check required categories
  const categories = new Set(inZone.map(b => b.category).filter(Boolean));
  const categoryPass = !req.requiredCategories?.length ||
    req.requiredCategories.every(c => categories.has(c));

  // Check required blueprints
  const blueprintNames = new Set(inZone.map(b => b.blueprint_name).filter(Boolean));
  const blueprintPass = !req.requiredBlueprints?.length ||
    req.requiredBlueprints.every(bp => blueprintNames.has(bp));

  // Check total primitives
  const totalPrimitives = inZone.length;
  const primitivePass = totalPrimitives >= (req.minTotalPrimitives || 0);

  // Check builds were placed AFTER bounty claim time
  const afterClaim = inZone.filter(b => {
    const createdAt = typeof b.created_at === 'number' ? b.created_at : new Date(b.created_at).getTime();
    return createdAt >= claim.claimed_at;
  });
  const timingPass = afterClaim.length >= (req.minTotalPrimitives || req.minStructures);

  const passed = structurePass && categoryPass && blueprintPass && primitivePass && timingPass;

  return {
    passed,
    details: {
      structureCount, structurePass,
      categoriesFound: Array.from(categories), categoryPass,
      blueprintsFound: Array.from(blueprintNames), blueprintPass,
      totalPrimitives, primitivePass,
      buildsAfterClaim: afterClaim.length, timingPass,
    },
  };
}

// ===========================================
// Reward Distribution
// ===========================================

interface BountyRewards {
  credits?: number;
  materials?: Record<string, number>;
  blueprintIds?: string[];
  reputation?: number;
}

async function awardBountyRewards(bounty: db.BountyRow, agentId: string): Promise<void> {
  const rewards = bounty.rewards as unknown as BountyRewards;

  // Credits
  if (rewards.credits) {
    await db.addCreditsWithCap(agentId, rewards.credits, BUILD_CREDIT_CONFIG.CREDIT_CAP);
  }

  // Materials
  if (rewards.materials) {
    for (const [materialType, amount] of Object.entries(rewards.materials)) {
      await db.addMaterial(agentId, materialType, amount);
    }
  }

  // Exclusive blueprints
  if (rewards.blueprintIds?.length) {
    for (const bpId of rewards.blueprintIds) {
      await db.unlockBlueprint(agentId, bpId, bounty.id);
    }
  }

  // Reputation
  if (rewards.reputation) {
    await db.addLocalReputation(agentId, rewards.reputation);
  }

  // Increment counter
  await db.incrementBountiesCompleted(agentId);

  // Revoke granted tools
  const grantedTools = Array.isArray(bounty.granted_tools)
    ? bounty.granted_tools
    : JSON.parse(bounty.granted_tools as unknown as string);
  if (grantedTools.length > 0) {
    revokeBountyTools(agentId, grantedTools);
  }
}

// ===========================================
// Helper: Admin auth
// ===========================================

function checkAdminKey(request: { headers: Record<string, string | string[] | undefined> }): boolean {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) return false;
  return request.headers['x-admin-key'] === adminKey;
}

// ===========================================
// Route Registration
// ===========================================

export async function registerBountyRoutes(fastify: FastifyInstance): Promise<void> {
  // Rebuild grants from DB on startup
  await rebuildBountyGrants();

  // -----------------------------------------------
  // BOUNTY ROUTES
  // -----------------------------------------------

  // GET /v1/bounties — List bounties
  fastify.get('/v1/bounties', async (request, reply) => {
    const rl = checkRateLimit('rest:bounties:list', request.ip, 30, 60_000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });

    const query = request.query as { type?: string; status?: string };
    const bounties = await db.getAllBounties({
      type: query.type,
      status: query.status,
    });
    return bounties;
  });

  // GET /v1/bounties/:id — Bounty detail
  fastify.get('/v1/bounties/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const bounty = await db.getBounty(id);
    if (!bounty) return reply.code(404).send({ error: 'Bounty not found' });

    const claims = await db.getBountyClaims(id);
    return { ...bounty, claims };
  });

  // POST /v1/bounties/:id/claim — Claim a bounty slot
  fastify.post('/v1/bounties/:id/claim', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const rl = checkRateLimit('rest:bounties:claim', auth.agentId, 5, 60_000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });

    const { id } = request.params as { id: string };
    const body = ClaimBountySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    const bounty = await db.getBounty(id);
    if (!bounty) return reply.code(404).send({ error: 'Bounty not found' });

    // Check coordinated guild requirement
    if (bounty.required_guild) {
      const guildId = body.data.guildId || await db.getAgentGuild(auth.agentId);
      if (!guildId) {
        return reply.code(400).send({ error: 'This bounty requires guild membership' });
      }

      // Check if existing claims use a different guild
      if (bounty.status === 'in_progress') {
        const existingClaims = await db.getBountyClaims(id);
        const existingGuild = existingClaims[0]?.guild_id;
        if (existingGuild && existingGuild !== guildId) {
          return reply.code(400).send({ error: 'Bounty is already claimed by a different guild' });
        }
      }
    }

    try {
      const claim = await db.claimBounty(id, auth.agentId, body.data.guildId);
      if (!claim) return reply.code(500).send({ error: 'Failed to claim bounty' });

      // Grant tools if bounty has them
      const grantedTools = Array.isArray(bounty.granted_tools)
        ? bounty.granted_tools
        : JSON.parse(bounty.granted_tools as unknown as string);
      if (grantedTools.length > 0) {
        grantBountyTools(auth.agentId, grantedTools);
      }

      // Broadcast event
      const world = getWorldManager();
      world.broadcastEvent({
        id: 0, agentId: auth.agentId, agentName: auth.agentId,
        source: 'system', kind: 'terminal',
        body: `Bounty claimed: "${bounty.title}" by agent ${auth.agentId}`,
        metadata: { bountyId: id }, createdAt: Date.now(),
      });

      return claim;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to claim bounty';
      return reply.code(400).send({ error: message });
    }
  });

  // POST /v1/bounties/:id/submit — Submit proof of completion
  fastify.post('/v1/bounties/:id/submit', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const rl = checkRateLimit('rest:bounties:submit', auth.agentId, 3, 60_000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });

    const { id } = request.params as { id: string };
    const body = SubmitBountyClaimSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    const bounty = await db.getBounty(id);
    if (!bounty) return reply.code(404).send({ error: 'Bounty not found' });

    const claim = await db.submitBountyClaim(id, auth.agentId, body.data.submission);
    if (!claim) return reply.code(400).send({ error: 'No active claim found or already submitted' });

    // Solo build: auto-verify
    if (bounty.type === 'solo_build') {
      const verification = await verifySoloBuild(bounty, auth.agentId);
      if (verification.passed) {
        await db.verifyBountyClaim(id, auth.agentId, true);
        await awardBountyRewards(bounty, auth.agentId);
        await db.updateBountyStatus(id, 'completed');

        const world = getWorldManager();
        world.broadcastEvent({
          id: 0, agentId: auth.agentId, agentName: auth.agentId,
          source: 'system', kind: 'terminal',
          body: `Bounty completed: "${bounty.title}" by agent ${auth.agentId}!`,
          metadata: { bountyId: id }, createdAt: Date.now(),
        });

        return { status: 'verified', verification: verification.details };
      } else {
        await db.verifyBountyClaim(id, auth.agentId, false);
        return { status: 'rejected', verification: verification.details };
      }
    }

    // Coordinated/creative: mark for review
    await db.updateBountyStatus(id, 'review');
    const world = getWorldManager();
    world.broadcastEvent({
      id: 0, agentId: auth.agentId, agentName: auth.agentId,
      source: 'system', kind: 'terminal',
      body: `Bounty submission received: "${bounty.title}" — under review`,
      metadata: { bountyId: id }, createdAt: Date.now(),
    });

    return { status: 'review', message: 'Submission under review.' };
  });

  // GET /v1/bounties/my-claims — Agent's bounty history
  fastify.get('/v1/bounties/my-claims', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    return db.getAgentBountyClaims(auth.agentId);
  });

  // -----------------------------------------------
  // ADMIN BOUNTY ROUTES
  // -----------------------------------------------

  // POST /v1/admin/bounties — Create bounty
  fastify.post('/v1/admin/bounties', async (request, reply) => {
    if (!checkAdminKey(request)) return reply.code(403).send({ error: 'Forbidden' });

    const body = CreateBountySchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    const bounty = await db.createBounty(body.data);
    if (!bounty) return reply.code(500).send({ error: 'Failed to create bounty' });

    const world = getWorldManager();
    world.broadcastEvent({
      id: 0, agentId: 'system', agentName: 'OpGrid',
      source: 'system', kind: 'terminal',
      body: `New bounty posted: "${bounty.title}" (${bounty.type}) — ${JSON.stringify(bounty.rewards)}`,
      metadata: { bountyId: bounty.id }, createdAt: Date.now(),
    });

    return bounty;
  });

  // PUT /v1/admin/bounties/:id — Update bounty
  fastify.put('/v1/admin/bounties/:id', async (request, reply) => {
    if (!checkAdminKey(request)) return reply.code(403).send({ error: 'Forbidden' });

    const { id } = request.params as { id: string };
    const body = request.body as { status?: string; announcement?: string };
    if (body.status) {
      await db.updateBountyStatus(id, body.status, body.announcement);
    }
    const bounty = await db.getBounty(id);
    return bounty;
  });

  // POST /v1/admin/bounties/:id/verify — Verify/reject a submission
  fastify.post('/v1/admin/bounties/:id/verify', async (request, reply) => {
    if (!checkAdminKey(request)) return reply.code(403).send({ error: 'Forbidden' });

    const { id } = request.params as { id: string };
    const body = VerifyBountyClaimSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    const bounty = await db.getBounty(id);
    if (!bounty) return reply.code(404).send({ error: 'Bounty not found' });

    await db.verifyBountyClaim(id, body.data.agentId, body.data.passed);

    if (body.data.passed) {
      await awardBountyRewards(bounty, body.data.agentId);
    }

    // Check if all claims are resolved
    const claims = await db.getBountyClaims(id);
    const allResolved = claims.every(c => c.status === 'verified' || c.status === 'rejected');
    if (allResolved) {
      await db.updateBountyStatus(id, 'completed', body.data.announcement);
    }

    const world = getWorldManager();
    const eventType = body.data.passed ? 'completed' : 'rejected';
    world.broadcastEvent({
      id: 0, agentId: 'system', agentName: 'OpGrid',
      source: 'system', kind: 'terminal',
      body: body.data.announcement || `Bounty ${eventType}: "${bounty.title}" for agent ${body.data.agentId}`,
      metadata: { bountyId: id }, createdAt: Date.now(),
    });

    return { status: eventType, bountyId: id, agentId: body.data.agentId };
  });

  // -----------------------------------------------
  // WORK ORDER ROUTES
  // -----------------------------------------------

  // POST /v1/work-orders — Create work order with escrow
  fastify.post('/v1/work-orders', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const rl = checkRateLimit('rest:work-orders:create', auth.agentId, 5, 60_000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });

    const body = CreateWorkOrderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    try {
      const wo = await db.createWorkOrder(
        auth.agentId, body.data.title, body.data.description, body.data.rewardCredits,
        BUILD_CREDIT_CONFIG.CREDIT_CAP
      );
      return wo;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create work order';
      return reply.code(400).send({ error: message });
    }
  });

  // GET /v1/work-orders — List open work orders
  fastify.get('/v1/work-orders', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const rl = checkRateLimit('rest:work-orders:list', auth.agentId, 30, 60_000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });

    return db.getOpenWorkOrders(auth.agentId);
  });

  // GET /v1/work-orders/:id — Work order detail
  fastify.get('/v1/work-orders/:id', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const wo = await db.getWorkOrder(id);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });
    return wo;
  });

  // POST /v1/work-orders/:id/claim — Claim a work order
  fastify.post('/v1/work-orders/:id/claim', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const rl = checkRateLimit('rest:work-orders:claim', auth.agentId, 5, 60_000);
    if (!rl.allowed) return reply.code(429).send({ error: 'Rate limit exceeded', retryAfterMs: rl.retryAfterMs });

    const { id } = request.params as { id: string };

    const wo = await db.getWorkOrder(id);
    if (!wo) return reply.code(404).send({ error: 'Work order not found' });

    // Check excluded and self-claim
    const excluded = Array.isArray(wo.excluded_agents)
      ? wo.excluded_agents
      : JSON.parse(wo.excluded_agents as unknown as string);
    if (excluded.includes(auth.agentId)) {
      return reply.code(403).send({ error: 'You are excluded from this work order' });
    }
    if (wo.issuer_id === auth.agentId) {
      return reply.code(400).send({ error: 'Cannot claim your own work order' });
    }

    const claimed = await db.claimWorkOrder(id, auth.agentId);
    if (!claimed) return reply.code(400).send({ error: 'Work order is no longer available' });

    // Auto-DM to issuer
    await db.sendDirectMessage(auth.agentId, 'agent', wo.issuer_id,
      `I claimed your work order: "${wo.title}" (ID: ${id})`
    );

    return claimed;
  });

  // POST /v1/work-orders/:id/submit — Submit proof
  fastify.post('/v1/work-orders/:id/submit', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const body = SubmitWorkOrderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    const submitted = await db.submitWorkOrder(id, auth.agentId, body.data.submission);
    if (!submitted) return reply.code(400).send({ error: 'Not the claimer or wrong status' });

    // Auto-DM to issuer
    await db.sendDirectMessage(auth.agentId, 'agent', submitted.issuer_id,
      `I submitted proof for work order: "${submitted.title}". Please review and confirm.`
    );

    return submitted;
  });

  // POST /v1/work-orders/:id/confirm — Confirm completion, release escrow
  fastify.post('/v1/work-orders/:id/confirm', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const body = ConfirmWorkOrderSchema.safeParse(request.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    try {
      const confirmed = await db.confirmWorkOrder(
        id, auth.agentId, body.data.feedbackScore, BUILD_CREDIT_CONFIG.CREDIT_CAP
      );
      if (!confirmed) return reply.code(400).send({ error: 'Failed to confirm' });

      // Badge milestones
      const completedCount = await db.getAgentWorkOrdersCompleted(confirmed.claimer_id!);
      const milestones = [10, 25, 50, 100];
      if (milestones.includes(completedCount)) {
        const world = getWorldManager();
        world.broadcastEvent({
          id: 0, agentId: confirmed.claimer_id!, agentName: confirmed.claimer_id!,
          source: 'system', kind: 'terminal',
          body: `Achievement unlocked: Agent ${confirmed.claimer_id} completed ${completedCount} work orders!`,
          metadata: { milestone: completedCount }, createdAt: Date.now(),
        });
      }

      // Onchain feedback (non-blocking)
      publishWorkOrderFeedbackOnChain({
        workOrderId: id,
        workerAgentId: confirmed.claimer_id!,
        score: body.data.feedbackScore,
      }).catch(err => console.warn('[Bounties] Onchain feedback failed:', err));

      // Auto-DM to claimer
      await db.sendDirectMessage(auth.agentId, 'agent', confirmed.claimer_id!,
        `Work order "${confirmed.title}" confirmed! +${confirmed.reward_credits} credits. Score: ${body.data.feedbackScore}/100.`
      );

      return confirmed;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to confirm work order';
      return reply.code(400).send({ error: message });
    }
  });

  // POST /v1/work-orders/:id/cancel — Cancel work order, refund escrow
  fastify.post('/v1/work-orders/:id/cancel', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;

    const { id } = request.params as { id: string };
    const body = CancelWorkOrderSchema.safeParse(request.body || {});
    if (!body.success) return reply.code(400).send({ error: 'Invalid body', details: body.error.flatten() });

    try {
      const wo = await db.getWorkOrder(id);
      if (!wo) return reply.code(404).send({ error: 'Work order not found' });

      const cancelled = await db.cancelWorkOrder(id, auth.agentId, body.data.excludeAgent);
      if (!cancelled) return reply.code(400).send({ error: 'Cannot cancel this work order' });

      // DM claimer if was claimed
      if (wo.claimer_id) {
        await db.sendDirectMessage(auth.agentId, 'agent', wo.claimer_id,
          `Work order "${wo.title}" was cancelled by the issuer.`
        );
      }

      // Repost with excluded agent
      if (body.data.repost && body.data.excludeAgent) {
        const excluded = Array.isArray(wo.excluded_agents)
          ? wo.excluded_agents
          : JSON.parse(wo.excluded_agents as unknown as string);
        excluded.push(body.data.excludeAgent);

        const newWo = await db.createWorkOrder(
          auth.agentId, wo.title, wo.description, wo.reward_credits,
          BUILD_CREDIT_CONFIG.CREDIT_CAP
        );
        return { cancelled, reposted: newWo };
      }

      return cancelled;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to cancel work order';
      return reply.code(400).send({ error: message });
    }
  });

  // GET /v1/work-orders/my-orders — Orders I posted
  fastify.get('/v1/work-orders/my-orders', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    return db.getAgentWorkOrders(auth.agentId);
  });

  // GET /v1/work-orders/my-claims — Orders I claimed
  fastify.get('/v1/work-orders/my-claims', async (request, reply) => {
    const auth = await authenticate(request, reply);
    if (!auth) return;
    return db.getAgentWorkClaims(auth.agentId);
  });
}
