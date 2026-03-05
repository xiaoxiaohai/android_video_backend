import { pool } from '../db/pool.js';

const TV_RATINGS = [
  { id: 'gte_9_0', label: '9.0+', minScore: 9.0 },
  { id: 'gte_8_0', label: '8.0+', minScore: 8.0 },
  { id: 'gte_7_0', label: '7.0+', minScore: 7.0 },
  { id: 'gte_6_0', label: '6.0+', minScore: 6.0 }
];
const TV_FILTERS_CACHE_TTL_MS = Number(process.env.TV_FILTERS_CACHE_TTL_MS || 5 * 60 * 1000);
let tvFiltersCache = { value: null, expiresAt: 0 };

function splitFacetTokens(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((x) => splitFacetTokens(x));
  }
  if (typeof value !== 'string') return [];

  return value
    .split(/[|,;/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeFacetId(label) {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseFacetListParam(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((x) => normalizeFacetId(x))
    .filter(Boolean);
}

function parseSearchWords(value) {
  if (!value) return [];
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseYearParam(value) {
  if (value == null || value === '') return null;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1800 || year > 2200) return Number.NaN;
  return year;
}

function parseRatingThreshold(value) {
  if (value == null || value === '') return null;
  const raw = String(value).trim().toLowerCase();
  const fromPreset = raw.match(/^gte_(\d+)(?:_(\d+))?$/);
  if (fromPreset) {
    const whole = Number(fromPreset[1]);
    const frac = fromPreset[2] ? Number(`0.${fromPreset[2]}`) : 0;
    return whole + frac;
  }
  const fromLabel = raw.match(/^(\d+(?:\.\d+)?)\+$/);
  if (fromLabel) return Number(fromLabel[1]);
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function buildTokenAnyFilterSql(columnSql, paramIndex) {
  return `EXISTS (
    SELECT 1
    FROM regexp_split_to_table(COALESCE(${columnSql}, ''), '[|,;/]') AS tok
    WHERE trim(both '-' from regexp_replace(replace(lower(trim(tok)), '&', ' and '), '[^a-z0-9]+', '-', 'g'))
      = ANY($${paramIndex}::text[])
  )`;
}

function toFacetList(values) {
  const map = new Map();
  for (const value of values) {
    const label = String(value || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { id: normalizeFacetId(label), label });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

const PRIORITY_COUNTRIES = ['United States', 'United Kingdom', 'Canada', 'Japan', 'South Korea'];

const COUNTRY_ALIASES = {
  'united states of america': 'United States',
  'usa': 'United States',
  'u.s.a.': 'United States',
  'u.s.': 'United States',
  'uk': 'United Kingdom',
  'great britain': 'United Kingdom',
};

function normalizeCountryLabel(label) {
  return COUNTRY_ALIASES[label.toLowerCase()] ?? label;
}

// 把 canonical slug（如 "united-states"）展开为所有别名 slug，用于 SQL 过滤
function expandCountryFilterSlugs(slugs) {
  // 反转 COUNTRY_ALIASES：canonical label → [alias label, ...]
  const canonicalToAliases = new Map();
  for (const [alias, canonical] of Object.entries(COUNTRY_ALIASES)) {
    const canonicalSlug = normalizeFacetId(canonical);
    if (!canonicalToAliases.has(canonicalSlug)) canonicalToAliases.set(canonicalSlug, []);
    canonicalToAliases.get(canonicalSlug).push(normalizeFacetId(alias));
  }
  const result = new Set(slugs);
  for (const slug of slugs) {
    const aliases = canonicalToAliases.get(slug);
    if (aliases) aliases.forEach((a) => result.add(a));
  }
  return Array.from(result);
}

// Like toFacetList but counts occurrences and sorts:
// priority countries first (fixed order), then rest by count desc.
function toCountryFacetList(values) {
  const map = new Map();
  for (const value of values) {
    const label = normalizeCountryLabel(String(value || '').trim());
    if (!label) continue;
    const key = label.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { id: normalizeFacetId(label), label, count: 0 });
    }
    map.get(key).count++;
  }
  const all = Array.from(map.values());
  // Match by inclusion to handle variants like "United States of America" vs "United States"
  const matchesPriority = (label, priorityName) => {
    const l = label.toLowerCase();
    const p = priorityName.toLowerCase();
    return l === p || l.startsWith(p) || p.startsWith(l);
  };
  const priority = PRIORITY_COUNTRIES
    .map(name => all.find(item => matchesPriority(item.label, name)))
    .filter(Boolean);
  const priorityKeys = new Set(priority.map(item => item.label.toLowerCase()));
  const rest = all
    .filter(item => !priorityKeys.has(item.label.toLowerCase()))
    .sort((a, b) => b.count - a.count);
  return [...priority, ...rest].map(({ id, label }) => ({ id, label }));
}

const ISO_LANGUAGE_LABELS = {
  en: 'English',
  es: 'Spanish',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  hi: 'Hindi',
  ar: 'Arabic',
  tr: 'Turkish',
  nl: 'Dutch',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  pl: 'Polish',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay'
};

function normalizeLanguageToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const lowered = raw.toLowerCase();
  const mapped = ISO_LANGUAGE_LABELS[lowered];
  return mapped || raw;
}

function collectLanguageCandidates(row) {
  const candidates = [];

  const raw = row.raw && typeof row.raw === 'object' ? row.raw : null;
  if (!raw) return candidates;

  candidates.push(...splitFacetTokens(raw.language));
  candidates.push(...splitFacetTokens(raw.lang));
  candidates.push(...splitFacetTokens(raw.original_language));
  candidates.push(...splitFacetTokens(raw.audio_language));
  candidates.push(...splitFacetTokens(raw.audio_languages));
  candidates.push(...splitFacetTokens(raw.language_name));
  candidates.push(...splitFacetTokens(raw.languages));

  return candidates;
}

const TRENDING_SEARCHES = {
  hotWords: [
    'The Addams Family 2',
    'Rio',
    'Predator: Badlands',
    'Smallville',
    'Love Is Blind',
    'Cross',
    'Fallout',
    'Paradise',
    'Reality Check: Inside America\'s Next Top Model',
    '56 Days',
  ],
  popularWords: [
    'Wuthering Heights',
    'Mercy',
    'Predator: Badlands',
    'Hamnet',
    'Supernatural',
    'Scrubs',
    'The Night Agent',
    'The Last Thing He Told Me',
    '56 Days',
    'Tagesschau',
  ],
};

export default async function contentRoutes(fastify) {
  fastify.get('/trending-searches', async () => TRENDING_SEARCHES);

  fastify.get('/content', async (request, reply) => {
    const type = request.query?.type ? Number(request.query.type) : null;
    const page = request.query?.page ? Number(request.query.page) : 1;
    const size = request.query?.size ? Number(request.query.size) : 30;
    const q = request.query?.q ? String(request.query.q).trim() : '';
    const searchWords = parseSearchWords(q);
    const normalizedQuery = searchWords.join(' ');
    const genreFilters = parseFacetListParam(request.query?.genre);
    const countryFilters = parseFacetListParam(request.query?.country);
    const languageFilters = parseFacetListParam(request.query?.language);
    const yearFilter = parseYearParam(request.query?.year);
    const ratingMin = parseRatingThreshold(request.query?.rating);

    if (type !== null && type !== 1 && type !== 2) {
      return reply.code(400).send({ error: 'invalid type, use 1(movie) or 2(tv)' });
    }
    if (!Number.isFinite(page) || page < 1) {
      return reply.code(400).send({ error: 'invalid page' });
    }
    if (!Number.isFinite(size) || size < 1 || size > 500) {
      return reply.code(400).send({ error: 'invalid size, range 1..500' });
    }
    if (Number.isNaN(yearFilter)) {
      return reply.code(400).send({ error: 'invalid year' });
    }
    if (Number.isNaN(ratingMin)) {
      return reply.code(400).send({ error: 'invalid rating' });
    }

    const offset = (page - 1) * size;
    const where = ['is_active = true'];
    const params = [];

    if (type !== null) {
      params.push(type);
      where.push(`type = $${params.length}`);
    }
    if (q) {
      if (searchWords.length > 0) {
        // Match by whole word to avoid substring noise like "brioc" when searching "rio".
        params.push(searchWords);
        where.push(
          `NOT EXISTS (
             SELECT 1
             FROM unnest($${params.length}::text[]) AS sw(word)
             WHERE (' ' || regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g') || ' ')
                   NOT LIKE ('% ' || sw.word || ' %')
           )`
        );
      } else {
        // Keep fallback for queries that cannot be tokenized by latin word rules.
        params.push(`%${q}%`);
        where.push(`title ILIKE $${params.length}`);
      }
    }
    if (genreFilters.length > 0) {
      params.push(genreFilters);
      where.push(buildTokenAnyFilterSql('genre', params.length));
    }
    if (countryFilters.length > 0) {
      params.push(expandCountryFilterSlugs(countryFilters));
      where.push(buildTokenAnyFilterSql('country', params.length));
    }
    if (languageFilters.length > 0) {
      params.push(languageFilters);
      where.push(
        buildTokenAnyFilterSql(
          `concat_ws(',', raw->>'language', raw->>'lang', raw->>'original_language', raw->>'audio_language', raw->>'audio_languages', raw->>'language_name', raw->>'languages')`,
          params.length
        )
      );
    }
    if (yearFilter !== null) {
      params.push(yearFilter);
      where.push(`release_year = $${params.length}`);
    }
    if (ratingMin !== null) {
      params.push(ratingMin);
      where.push(
        `(CASE WHEN imdb_score ~ '^[0-9]+(\\.[0-9]+)?$' THEN imdb_score::numeric ELSE NULL END) >= $${params.length}`
      );
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const countSql = `SELECT count(*)::int AS total FROM content_item ${whereSql}`;
    const whereParams = [...params];
    const listParams = [...whereParams];
    const normalizedTitleSql = `trim(regexp_replace(lower(title), '[^a-z0-9]+', ' ', 'g'))`;
    let relevanceOrderSql = '';
    if (q) {
      if (normalizedQuery) {
        listParams.push(normalizedQuery);
        const qParam = `$${listParams.length}`;
        relevanceOrderSql = `
          CASE
            WHEN ${normalizedTitleSql} = ${qParam} THEN 0
            WHEN ${normalizedTitleSql} LIKE (${qParam} || ' %') THEN 1
            WHEN (' ' || ${normalizedTitleSql} || ' ') LIKE ('% ' || ${qParam} || ' %') THEN 2
            ELSE 3
          END ASC,
        `;
      } else {
        listParams.push(q.toLowerCase());
        const qParam = `$${listParams.length}`;
        relevanceOrderSql = `
          CASE
            WHEN lower(title) = ${qParam} THEN 0
            WHEN lower(title) LIKE (${qParam} || '%') THEN 1
            ELSE 2
          END ASC,
        `;
      }
    }
    const listSql = `
      SELECT *
      FROM content_item
      ${whereSql}
      ORDER BY
        ${relevanceOrderSql}
        COALESCE(
          CASE WHEN release ~ '^[1-9][0-9]{3}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' THEN release::date ELSE NULL END,
          CASE WHEN release_year IS NOT NULL THEN make_date(release_year, 1, 1) ELSE NULL END
        ) DESC NULLS LAST,
        (CASE WHEN imdb_score ~ '^[0-9]+(\\.[0-9]+)?$' THEN imdb_score::numeric ELSE NULL END) DESC NULLS LAST,
        id DESC
      LIMIT $${listParams.length + 1}
      OFFSET $${listParams.length + 2}
    `;

    const countRes = await pool.query(countSql, whereParams);
    const total = countRes.rows[0]?.total || 0;
    const listRes = await pool.query(listSql, [...listParams, size, offset]);

    return {
      items: listRes.rows,
      page,
      size,
      total,
      has_more: page * size < total
    };
  });

  fastify.get('/content/:id', async (request, reply) => {
    const id = Number(request.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: 'invalid id' });

    const { rows } = await pool.query('SELECT * FROM content_item WHERE id = $1 AND is_active = true', [id]);
    if (!rows[0]) return reply.code(404).send({ error: 'not found' });
    return rows[0];
  });

  fastify.get('/content/by-movie-id/:movieId', async (request) => {
    const movieId = String(request.params.movieId);
    const type = request.query?.type ? Number(request.query.type) : null;

    if (type === 1 || type === 2) {
      const { rows } = await pool.query(
        'SELECT * FROM content_item WHERE movie_id = $1 AND type = $2 AND is_active = true ORDER BY updated_at DESC LIMIT 1',
        [movieId, type]
      );
      return rows[0] || null;
    }

    const { rows } = await pool.query(
      'SELECT * FROM content_item WHERE movie_id = $1 AND is_active = true ORDER BY updated_at DESC',
      [movieId]
    );
    return rows;
  });

  fastify.get('/tv/filters', async () => {
    const now = Date.now();
    if (tvFiltersCache.value && now < tvFiltersCache.expiresAt) {
      return tvFiltersCache.value;
    }

    const { rows } = await pool.query(
      `SELECT genre, country, release_year
       FROM content_item
       WHERE type = 2 AND is_active = true`
    );

    const genreValues = [];
    const countryValues = [];
    const yearsSet = new Set();

    for (const row of rows) {
      genreValues.push(...splitFacetTokens(row.genre));
      countryValues.push(...splitFacetTokens(row.country));

      if (Number.isInteger(row.release_year)) {
        yearsSet.add(row.release_year);
      }
    }

    const years = Array.from(yearsSet).sort((a, b) => b - a);

    const response = {
      genres: toFacetList(genreValues),
      countries: toCountryFacetList(countryValues),
      years,
      ratings: TV_RATINGS,
    };

    tvFiltersCache = {
      value: response,
      expiresAt: now + Math.max(0, TV_FILTERS_CACHE_TTL_MS)
    };

    return response;
  });

  fastify.get('/tv/without-episodes/ids', async (request, reply) => {
    const active = request.query?.active == null ? 'true' : String(request.query.active).toLowerCase();
    if (active !== 'true' && active !== 'false') {
      return reply.code(400).send({ error: 'invalid active, use true or false' });
    }
    const onlyActive = active === 'true';

    const params = [];
    const where = ['c.type = 2'];
    if (onlyActive) where.push('c.is_active = true');
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const sql = `
      SELECT c.id, c.movie_id
      FROM content_item c
      ${whereSql}
        AND NOT EXISTS (
          SELECT 1
          FROM tv_episode_item e
          WHERE e.movie_id = c.movie_id
            AND e.is_active = true
        )
      ORDER BY c.id DESC
    `;
    const { rows } = await pool.query(sql, params);
    const ids = rows.map((x) => String(x.id));
    const movieIds = rows.map((x) => String(x.movie_id));

    return {
      total: rows.length,
      ids,
      movie_ids: movieIds,
      items: rows
    };
  });

  fastify.get('/tv/:movieId/episodes', async (request) => {
    const movieId = String(request.params.movieId);
    const { rows } = await pool.query(
      `SELECT * FROM tv_episode_item
       WHERE movie_id = $1 AND is_active = true
       ORDER BY season_num NULLS LAST, episode_num NULLS LAST, position NULLS LAST`,
      [movieId]
    );

    const grouped = {};
    for (const row of rows) {
      const key = row.season || `Season ${row.season_num ?? ''}`.trim();
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }
    return grouped;
  });
}
