import { pool } from '../db/pool.js';

export default async function homeRoutes(fastify) {
  fastify.get('/home', async () => {
    const bannerRes = await pool.query(
      `SELECT b.id, b.sort_order, c.*
       FROM home_banner_item b
       LEFT JOIN content_item c ON c.id = b.content_id
       WHERE b.is_active = true
       ORDER BY b.sort_order ASC, b.id ASC`
    );

    const channelRes = await pool.query(
      `SELECT name, img, sort_order
       FROM provider_channel
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`
    );

    const sectionRes = await pool.query(
      `SELECT id, name, has_all, tags, ui_type, sort_order
       FROM home_category_section
       WHERE is_active = true
       ORDER BY sort_order ASC, id ASC`
    );

    const sections = [];
    for (const section of sectionRes.rows) {
      const itemsRes = await pool.query(
        `SELECT c.*
         FROM home_category_item i
         JOIN content_item c ON c.id = i.content_id
         WHERE i.section_id = $1 AND i.is_active = true AND c.is_active = true
         ORDER BY i.sort_order ASC`,
        [section.id]
      );

      sections.push({
        name: section.name,
        has_all: section.has_all,
        tags: section.tags || [],
        ui_type: section.ui_type,
        items: itemsRes.rows
      });
    }

    return {
      banner: bannerRes.rows.map((row) => row.id ? row : null).filter(Boolean),
      channels: channelRes.rows.map((x) => ({ name: x.name, img: x.img })),
      sections
    };
  });

  fastify.get('/channel/:name/items', async (request, reply) => {
    const channelName = String(request.params?.name || '').trim();
    const page = request.query?.page ? Number(request.query.page) : 1;
    const size = request.query?.size ? Number(request.query.size) : 30;

    if (!channelName) return reply.code(400).send({ error: 'channel name required' });
    if (!Number.isFinite(page) || page < 1) {
      return reply.code(400).send({ error: 'invalid page' });
    }
    if (!Number.isFinite(size) || size < 1 || size > 500) {
      return reply.code(400).send({ error: 'invalid size, range 1..500' });
    }

    const channelRes = await pool.query(
      `SELECT id, name, img
       FROM provider_channel
       WHERE name = $1 AND is_active = true
       LIMIT 1`,
      [channelName]
    );
    const channel = channelRes.rows[0];
    if (!channel) return reply.code(404).send({ error: 'channel not found' });

    const offset = (page - 1) * size;
    const totalRes = await pool.query(
      `SELECT count(*)::int AS total
       FROM provider_channel_item i
       JOIN content_item c ON c.id = i.content_id
       WHERE i.channel_id = $1 AND i.is_active = true AND c.is_active = true`,
      [channel.id]
    );
    const total = totalRes.rows[0]?.total || 0;

    const itemsRes = await pool.query(
      `SELECT c.*
       FROM provider_channel_item i
       JOIN content_item c ON c.id = i.content_id
       WHERE i.channel_id = $1 AND i.is_active = true AND c.is_active = true
       ORDER BY i.sort_order ASC, c.updated_at DESC, c.id DESC
       LIMIT $2 OFFSET $3`,
      [channel.id, size, offset]
    );

    return {
      channel: { name: channel.name, img: channel.img },
      items: itemsRes.rows,
      page,
      size,
      total,
      has_more: page * size < total
    };
  });
}
