function toObj(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function toArr(value) {
  if (Array.isArray(value)) return value;
  return [];
}

async function upsertProviderChannel(client, { name, img = '', sortOrder = 0, isActive = true, raw = {} }) {
  const res = await client.query(
    `INSERT INTO provider_channel (name, img, sort_order, is_active, raw)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (name) DO UPDATE SET
       img=EXCLUDED.img,
       sort_order=EXCLUDED.sort_order,
       is_active=EXCLUDED.is_active,
       raw=EXCLUDED.raw
     RETURNING id, name, img`,
    [name, img, sortOrder, isActive, JSON.stringify(raw)]
  );
  return res.rows[0];
}

export async function upsertContent(client, item) {
  const channels = toObj(item.channels, {});
  const raw = toObj(item.raw, item);
  const tag =
    typeof item.tag === 'string' && item.tag.trim()
      ? item.tag.trim()
      : typeof raw.tag === 'string' && raw.tag.trim()
      ? raw.tag.trim()
      : null;
  await client.query(
    `
      INSERT INTO content_item (
        id, md_id, tmdb_id, movie_id, type, play_type, tag, title, url, img, imdb_score,
        "desc", release, release_year, genre, "cast", duration, country, production,
        last_season, last_episode, channels, cover_img, genre_lang, raw, is_active
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18,$19,
        $20,$21,$22,$23,$24,$25,$26
      )
      ON CONFLICT (id) DO UPDATE SET
        md_id=EXCLUDED.md_id,
        tmdb_id=EXCLUDED.tmdb_id,
        movie_id=EXCLUDED.movie_id,
        type=EXCLUDED.type,
        play_type=EXCLUDED.play_type,
        tag=COALESCE(EXCLUDED.tag, content_item.tag),
        title=EXCLUDED.title,
        url=EXCLUDED.url,
        img=EXCLUDED.img,
        imdb_score=EXCLUDED.imdb_score,
        "desc"=EXCLUDED."desc",
        release=EXCLUDED.release,
        release_year=EXCLUDED.release_year,
        genre=EXCLUDED.genre,
        "cast"=EXCLUDED."cast",
        duration=EXCLUDED.duration,
        country=EXCLUDED.country,
        production=EXCLUDED.production,
        last_season=EXCLUDED.last_season,
        last_episode=EXCLUDED.last_episode,
        channels=EXCLUDED.channels,
        cover_img=EXCLUDED.cover_img,
        genre_lang=EXCLUDED.genre_lang,
        raw=EXCLUDED.raw,
        is_active=EXCLUDED.is_active
    `,
    [
      item.id,
      item.md_id ?? null,
      item.tmdb_id ?? null,
      item.movie_id ?? String(item.tmdb_id ?? item.id ?? ''),
      item.type ?? 1,
      item.play_type ?? null,
      tag,
      item.title ?? '',
      item.url ?? null,
      item.img ?? null,
      item.imdb_score ?? null,
      item.desc ?? null,
      item.release ?? null,
      item.release_year ?? null,
      item.genre ?? null,
      item.cast ?? null,
      item.duration ?? null,
      item.country ?? null,
      item.production ?? null,
      item.last_season ?? null,
      item.last_episode ?? null,
      JSON.stringify(channels),
      item.cover_img ?? null,
      item.genre_lang ?? null,
      JSON.stringify(raw),
      item.is_active ?? true
    ]
  );
}

export async function importContentItems(client, items) {
  let count = 0;
  for (const item of toArr(items)) {
    if (!item || item.id == null) continue;
    await upsertContent(client, item);
    count += 1;
  }
  return count;
}

export async function importEpisodes(client, movieId, payload) {
  let episodes = [];
  if (Array.isArray(payload)) {
    episodes = payload;
  } else if (payload && typeof payload === 'object') {
    for (const value of Object.values(payload)) {
      if (Array.isArray(value)) episodes.push(...value);
    }
  }

  let count = 0;
  for (const ep of episodes) {
    if (!ep || ep.id == null) continue;
    const channels = toObj(ep.channels, {});
    const raw = toObj(ep.raw, ep);
    const values = [
      ep.id,
      ep.movie_id ?? movieId,
      ep.season ?? '',
      ep.episode ?? '',
      JSON.stringify(channels),
      ep.position ?? null,
      ep.season_num ?? null,
      ep.episode_num ?? null,
      JSON.stringify(raw),
      ep.is_active ?? true
    ];

    const savepoint = `sp_ep_${count}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      await client.query(
        `
          INSERT INTO tv_episode_item (
            id, movie_id, season, episode, channels, position,
            season_num, episode_num, raw, is_active
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          ON CONFLICT (id) DO UPDATE SET
            movie_id=EXCLUDED.movie_id,
            season=EXCLUDED.season,
            episode=EXCLUDED.episode,
            channels=EXCLUDED.channels,
            position=EXCLUDED.position,
            season_num=EXCLUDED.season_num,
            episode_num=EXCLUDED.episode_num,
            raw=EXCLUDED.raw,
            is_active=EXCLUDED.is_active
        `,
        values
      );
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (err) {
      // Some upstream rows reuse episode slot (movie_id+season_num+episode_num) with a different id.
      // In that case, update by slot key instead of failing the whole import batch.
      const isSlotDuplicate =
        err?.code === '23505' &&
        (err?.constraint === 'uq_tv_episode_movie_season_episode_num' ||
          String(err?.message || '').includes('uq_tv_episode_movie_season_episode_num'));

      if (!isSlotDuplicate) {
        throw err;
      }
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);

      const fallbackValues = [
        values[1], // movie_id
        values[2], // season
        values[3], // episode
        values[4], // channels
        values[5], // position
        values[6], // season_num
        values[7], // episode_num
        values[8], // raw
        values[9] // is_active
      ];

      const fallback = await client.query(
        `
          UPDATE tv_episode_item
             SET season=$2,
                 episode=$3,
                 channels=$4,
                 position=$5,
                 raw=$8,
                 is_active=$9,
                 updated_at=NOW()
           WHERE movie_id=$1
             AND season_num IS NOT DISTINCT FROM $6
             AND episode_num IS NOT DISTINCT FROM $7
        `,
        fallbackValues
      );
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);

      if ((fallback?.rowCount || 0) < 1) {
        throw err;
      }
    }
    count += 1;
  }
  return count;
}

export async function importHomeData(client, body, mode = 'replace') {
  const banner = toArr(body.banner);
  const channels = toArr(body.channels);
  const sections = toArr(body.sections);

  if (mode === 'replace') {
    await client.query('DELETE FROM provider_channel_item');
    await client.query('DELETE FROM home_category_item');
    await client.query('DELETE FROM home_category_section');
    await client.query('DELETE FROM home_banner_item');
    await client.query('DELETE FROM provider_channel');
  }

  for (let i = 0; i < banner.length; i += 1) {
    const item = banner[i];
    if (!item || item.id == null) continue;
    await upsertContent(client, item);
    await client.query(
      `INSERT INTO home_banner_item (content_id, sort_order, is_active, raw)
       VALUES ($1,$2,$3,$4)`,
      [item.id, i, true, JSON.stringify(item)]
    );
  }

  for (let i = 0; i < channels.length; i += 1) {
    const c = channels[i];
    if (!c?.name) continue;
    const channel = await upsertProviderChannel(client, {
      name: c.name,
      img: c.img ?? '',
      sortOrder: i,
      isActive: true,
      raw: c
    });
    const channelId = channel?.id;
    if (!channelId) continue;

    const channelItems = toArr(c.items);
    for (let j = 0; j < channelItems.length; j += 1) {
      const item = channelItems[j];
      if (!item || item.id == null) continue;
      await upsertContent(client, item);
      await client.query(
        `INSERT INTO provider_channel_item (channel_id, content_id, sort_order, is_active)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (channel_id, content_id) DO UPDATE SET
           sort_order=EXCLUDED.sort_order,
           is_active=EXCLUDED.is_active`,
        [channelId, item.id, j, true]
      );
    }
  }

  for (let i = 0; i < sections.length; i += 1) {
    const s = sections[i];
    if (!s?.name) continue;

    const sectionRes = await client.query(
      `INSERT INTO home_category_section (name, has_all, tags, ui_type, sort_order, is_active, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (name) DO UPDATE SET
         has_all=EXCLUDED.has_all,
         tags=EXCLUDED.tags,
         ui_type=EXCLUDED.ui_type,
         sort_order=EXCLUDED.sort_order,
         is_active=EXCLUDED.is_active,
         raw=EXCLUDED.raw
       RETURNING id`,
      [
        s.name,
        Boolean(s.has_all),
        JSON.stringify(toArr(s.tags)),
        s.ui_type ?? 1,
        i,
        true,
        JSON.stringify(s)
      ]
    );

    const sectionId = sectionRes.rows[0].id;
    const items = toArr(s.items);
    for (let j = 0; j < items.length; j += 1) {
      const item = items[j];
      if (!item || item.id == null) continue;
      await upsertContent(client, item);
      await client.query(
        `INSERT INTO home_category_item (section_id, content_id, sort_order, is_active)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (section_id, content_id) DO UPDATE SET
           sort_order=EXCLUDED.sort_order,
           is_active=EXCLUDED.is_active`,
        [sectionId, item.id, j, true]
      );
    }
  }

  return {
    banner: banner.length,
    channels: channels.length,
    sections: sections.length
  };
}

export async function importChannelItems(client, channelName, body = {}) {
  const mode = body?.mode === 'replace' ? 'replace' : 'append';
  const items = toArr(body?.items);
  const channel = await upsertProviderChannel(client, {
    name: channelName,
    img: body?.img ?? '',
    sortOrder: Number.isFinite(body?.sort_order) ? Number(body.sort_order) : 0,
    isActive: body?.is_active ?? true,
    raw: body
  });

  if (mode === 'replace') {
    await client.query('DELETE FROM provider_channel_item WHERE channel_id = $1', [channel.id]);
  }

  let imported = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item || item.id == null) continue;
    await upsertContent(client, item);
    await client.query(
      `INSERT INTO provider_channel_item (channel_id, content_id, sort_order, is_active)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (channel_id, content_id) DO UPDATE SET
         sort_order=EXCLUDED.sort_order,
         is_active=EXCLUDED.is_active`,
      [channel.id, item.id, i, item.is_active ?? true]
    );
    imported += 1;
  }

  return {
    channel: { id: channel.id, name: channel.name, img: channel.img },
    imported,
    mode
  };
}
