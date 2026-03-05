import { z } from 'zod';
import { withTx } from '../db/pool.js';
import { importChannelItems, importContentItems, importEpisodes, importHomeData } from '../services/importService.js';

const contentSchema = z.object({
  items: z.array(z.record(z.any())).default([])
});

const homeSchema = z.object({
  mode: z.enum(['replace', 'append']).default('replace'),
  banner: z.array(z.record(z.any())).default([]),
  channels: z.array(z.record(z.any())).default([]),
  sections: z.array(z.record(z.any())).default([])
});

const channelItemsSchema = z.object({
  mode: z.enum(['replace', 'append']).default('append'),
  img: z.string().optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
  items: z.array(z.record(z.any())).default([])
});

export default async function importRoutes(fastify) {
  fastify.post('/import/content', async (request, reply) => {
    const parsed = contentSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const count = await withTx(async (client) => importContentItems(client, parsed.data.items));
    return { ok: true, imported: count };
  });

  fastify.post('/import/episodes/:movieId', async (request, reply) => {
    const movieId = String(request.params.movieId || '').trim();
    if (!movieId) return reply.code(400).send({ error: 'movieId required' });

    const payload = (request.body && request.body.data) || request.body || {};
    const count = await withTx(async (client) => importEpisodes(client, movieId, payload));
    return { ok: true, movieId, imported: count };
  });

  fastify.post('/import/home', async (request, reply) => {
    const parsed = homeSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTx(async (client) =>
      importHomeData(client, parsed.data, parsed.data.mode)
    );

    return { ok: true, ...result, mode: parsed.data.mode };
  });

  fastify.post('/import/channel/:name/items', async (request, reply) => {
    const channelName = String(request.params?.name || '').trim();
    if (!channelName) return reply.code(400).send({ error: 'channel name required' });

    const parsed = channelItemsSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const result = await withTx(async (client) =>
      importChannelItems(client, channelName, parsed.data)
    );
    return { ok: true, ...result };
  });
}
