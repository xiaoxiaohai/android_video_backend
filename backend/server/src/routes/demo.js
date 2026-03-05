import { z } from 'zod';
import { resolveM3u8Demo } from '../services/demoResolver.js';
import { resolveUpstream } from '../services/upstreamResolver.js';

const schema = z.object({
  watchUrl: z.string().url(),
  referer: z.string().url().optional(),
  origin: z.string().url().optional(),
  cookie: z.string().optional(),
  userAgent: z.string().optional(),
  timeoutMs: z.number().int().min(5000).max(60000).optional(),
  compact: z.boolean().optional()
});

const upstreamSchema = z.object({
  watchUrl: z.string().url(),
  force: z.boolean().optional()
});

export default async function demoRoutes(fastify) {
  fastify.post('/demo/resolve-m3u8', async (request, reply) => {
    const parsed = schema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const data = await resolveM3u8Demo(parsed.data);
      return data;
    } catch (err) {
      return reply.code(502).send({
        ok: false,
        error: err?.message || String(err)
      });
    }
  });

  fastify.post('/ru', async (request, reply) => {
    const parsed = upstreamSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    try {
      const data = await resolveUpstream(parsed.data.watchUrl, parsed.data.force === true);
      return data;
    } catch (err) {
      return reply.code(502).send({
        ok: false,
        error: err?.message || String(err)
      });
    }
  });
}
