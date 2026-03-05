import { z } from 'zod';
import { withTx } from '../db/pool.js';
import { config } from '../config.js';

const cleanupSchema = z.object({
  contentIds: z.array(z.number().int().positive()).default([990001]),
  movieIds: z.array(z.string().min(1)).default(['t990001']),
  episodeIds: z.array(z.number().int().positive()).default([991001, 991002, 992001]),
  dryRun: z.boolean().default(false)
});

function mergeUniqueNumberArrays(...arrs) {
  const s = new Set();
  arrs.flat().forEach((v) => {
    if (Number.isFinite(v)) s.add(Number(v));
  });
  return [...s];
}

function mergeUniqueStringArrays(...arrs) {
  const s = new Set();
  arrs.flat().forEach((v) => {
    const t = String(v || '').trim();
    if (t) s.add(t);
  });
  return [...s];
}

export default async function adminRoutes(fastify) {
  fastify.get('/admin/stats', async (request, reply) => {
    if (config.adminApiKey) {
      const key = String(request.headers['x-admin-key'] || '');
      if (key !== config.adminApiKey) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    }

    const type = request.query?.type ? Number(request.query.type) : null;
    if (type !== null && type !== 1 && type !== 2) {
      return reply.code(400).send({ error: 'invalid type, use 1(movie) or 2(tv)' });
    }

    const whereType = type ? 'AND type = $1' : '';
    const params = type ? [type] : [];

    const contentTotalRes = await withTx(async (db) => {
      const total = await db.query(
        `SELECT count(*)::int AS c
         FROM content_item
         WHERE is_active = true ${whereType}`,
        params
      );

      // "channels present" means JSON has at least 1 key.
      const withChannels = await db.query(
        `SELECT count(*)::int AS c
         FROM content_item
         WHERE is_active = true ${whereType}
           AND channels IS NOT NULL
           AND jsonb_typeof(channels) = 'object'
           AND channels <> '{}'::jsonb`,
        params
      );

      const updated = await db.query(
        `SELECT
           max(updated_at) AS max_updated_at,
           min(created_at) AS min_created_at
         FROM content_item
         WHERE is_active = true ${whereType}`,
        params
      );

      const episodesTotal = await db.query(
        `SELECT count(*)::int AS c
         FROM tv_episode_item
         WHERE is_active = true`
      );

      const episodesWithChannels = await db.query(
        `SELECT count(*)::int AS c
         FROM tv_episode_item
         WHERE is_active = true
           AND channels IS NOT NULL
           AND jsonb_typeof(channels) = 'object'
           AND channels <> '{}'::jsonb`
      );

      const homeSections = await db.query(
        `SELECT count(*)::int AS c
         FROM home_category_section
         WHERE is_active = true`
      );

      const homeItems = await db.query(
        `SELECT count(*)::int AS c
         FROM home_category_item
         WHERE is_active = true`
      );

      const homeBanners = await db.query(
        `SELECT count(*)::int AS c
         FROM home_banner_item
         WHERE is_active = true`
      );

      const providers = await db.query(
        `SELECT count(*)::int AS c
         FROM provider_channel
         WHERE is_active = true`
      );

      return {
        content_total: total.rows[0].c,
        content_with_channels: withChannels.rows[0].c,
        content_channels_coverage:
          total.rows[0].c > 0 ? withChannels.rows[0].c / total.rows[0].c : 0,
        content_max_updated_at: updated.rows[0].max_updated_at,
        content_min_created_at: updated.rows[0].min_created_at,
        episodes_total: episodesTotal.rows[0].c,
        episodes_with_channels: episodesWithChannels.rows[0].c,
        episodes_channels_coverage:
          episodesTotal.rows[0].c > 0 ? episodesWithChannels.rows[0].c / episodesTotal.rows[0].c : 0,
        home_sections: homeSections.rows[0].c,
        home_items: homeItems.rows[0].c,
        home_banners: homeBanners.rows[0].c,
        provider_channels: providers.rows[0].c
      };
    });

    return { ok: true, type: type ?? 'all', stats: contentTotalRes };
  });

  fastify.post('/admin/cleanup-test-data', async (request, reply) => {
    if (config.adminApiKey) {
      const key = String(request.headers['x-admin-key'] || '');
      if (key !== config.adminApiKey) {
        return reply.code(401).send({ error: 'unauthorized' });
      }
    }

    const parsed = cleanupSchema.safeParse(request.body || {});
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.flatten() });
    }

    const input = parsed.data;
    const contentIds = mergeUniqueNumberArrays(input.contentIds);
    const movieIds = mergeUniqueStringArrays(input.movieIds);
    const episodeIds = mergeUniqueNumberArrays(input.episodeIds);

    const result = await withTx(async (db) => {
      const homeCategoryRes = await db.query(
        'SELECT count(*)::int AS c FROM home_category_item WHERE content_id = ANY($1::bigint[])',
        [contentIds]
      );
      const homeBannerRes = await db.query(
        'SELECT count(*)::int AS c FROM home_banner_item WHERE content_id = ANY($1::bigint[])',
        [contentIds]
      );
      const episodeRes = await db.query(
        'SELECT count(*)::int AS c FROM tv_episode_item WHERE movie_id = ANY($1::text[]) OR id = ANY($2::bigint[])',
        [movieIds, episodeIds]
      );
      const contentRes = await db.query(
        'SELECT count(*)::int AS c FROM content_item WHERE id = ANY($1::bigint[]) OR movie_id = ANY($2::text[])',
        [contentIds, movieIds]
      );

      const toDelete = {
        home_category_item: homeCategoryRes.rows[0].c,
        home_banner_item: homeBannerRes.rows[0].c,
        tv_episode_item: episodeRes.rows[0].c,
        content_item: contentRes.rows[0].c
      };

      if (!input.dryRun) {
        await db.query('DELETE FROM home_category_item WHERE content_id = ANY($1::bigint[])', [contentIds]);
        await db.query('DELETE FROM home_banner_item WHERE content_id = ANY($1::bigint[])', [contentIds]);
        await db.query(
          'DELETE FROM tv_episode_item WHERE movie_id = ANY($1::text[]) OR id = ANY($2::bigint[])',
          [movieIds, episodeIds]
        );
        await db.query(
          'DELETE FROM content_item WHERE id = ANY($1::bigint[]) OR movie_id = ANY($2::text[])',
          [contentIds, movieIds]
        );
      }

      return toDelete;
    });

    return {
      ok: true,
      dryRun: input.dryRun,
      matched: result,
      target: { contentIds, movieIds, episodeIds }
    };
  });
}
