import { queryMariaDb } from '@/database/clients/mariadb';
import { getQdrantClient, QDRANT_COLLECTION, VECTOR_DIM } from '@/database/clients/qdrant';
import { getEmbedding, getEmbeddings } from '@/database/clients/openai';
import {
  PocModelType,
  SeedMedia,
  Poc1SearchTag,
  Poc1MediaResult,
} from '@/types';
import { IPocModel } from './base';
import { fetchAllTags } from './tag-helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ---------------------------------------------------------------------------
// Fixed-tag → Qdrant field-name mapping
// All 17 FIXED tag names from poc1-tag-definitions.ts, lowercased to snake_case.
// ---------------------------------------------------------------------------

export const FIXED_TAG_FIELD: Record<string, string> = {
  Setting:           'setting',
  Country:           'country',
  TimeOfDay:         'time_of_day',
  Lighting:          'lighting',
  ShotType:          'shot_type',
  DepthOfField:      'depth_of_field',
  Weather:           'weather',
  People:            'people',
  Guide:             'guide',
  PeopleActivity:    'people_activity',
  Clothing:          'clothing',
  Objects:           'objects',
  Transport:         'transport',
  OperatorBrand:     'operator_brand',
  travelCardBrandName: 'travel_card_brand_name',
  TransportAttribute: 'transport_attribute',
  Design:            'design',
};

// ---------------------------------------------------------------------------
// Fixed-tag value → integer mapping (1-indexed from options array order)
// ---------------------------------------------------------------------------

export const FIXED_TAG_VALUE_MAP: Record<string, Record<string, number>> = {
  Setting: { Indoor: 1, Outdoor: 2 },
  Country: {
    AFGHANISTAN: 1, ALBANIA: 2, ALGERIA: 3, ANDORRA: 4, ANGOLA: 5,
    ANTIGUA_AND_BARBUDA: 6, ARGENTINA: 7, ARMENIA: 8, AUSTRALIA: 9, AUSTRIA: 10,
    AZERBAIJAN: 11, BAHAMAS: 12, BAHRAIN: 13, BANGLADESH: 14, BARBADOS: 15,
    BELARUS: 16, BELGIUM: 17, BELIZE: 18, BENIN: 19, BHUTAN: 20,
    BOLIVIA: 21, BOSNIA_AND_HERZEGOVINA: 22, BOTSWANA: 23, BRAZIL: 24, BRUNEI: 25,
    BULGARIA: 26, BURKINA_FASO: 27, BURUNDI: 28, CABO_VERDE: 29, CAMBODIA: 30,
    CAMEROON: 31, CANADA: 32, CENTRAL_AFRICAN_REPUBLIC: 33, CHAD: 34, CHILE: 35,
    CHINA: 36, COLOMBIA: 37, COMOROS: 38, CONGO: 39, COSTA_RICA: 40,
    CROATIA: 41, CUBA: 42, CYPRUS: 43, CZECHIA: 44, DEMOCRATIC_REPUBLIC_OF_CONGO: 45,
    DENMARK: 46, DJIBOUTI: 47, DOMINICA: 48, DOMINICAN_REPUBLIC: 49, ECUADOR: 50,
    EGYPT: 51, EL_SALVADOR: 52, EQUATORIAL_GUINEA: 53, ERITREA: 54, ESTONIA: 55,
    ESWATINI: 56, ETHIOPIA: 57, FIJI: 58, FINLAND: 59, FRANCE: 60,
    GABON: 61, GAMBIA: 62, GEORGIA: 63, GERMANY: 64, GHANA: 65,
    GREECE: 66, GRENADA: 67, GUATEMALA: 68, GUINEA: 69, GUINEA_BISSAU: 70,
    GUYANA: 71, HAITI: 72, HOLY_SEE: 73, HONDURAS: 74, HUNGARY: 75,
    ICELAND: 76, INDIA: 77, INDONESIA: 78, IRAN: 79, IRAQ: 80,
    IRELAND: 81, ISRAEL: 82, ITALY: 83, JAMAICA: 84, JAPAN: 85,
    JORDAN: 86, KAZAKHSTAN: 87, KENYA: 88, KIRIBATI: 89, KUWAIT: 90,
    KYRGYZSTAN: 91, LAOS: 92, LATVIA: 93, LEBANON: 94, LESOTHO: 95,
    LIBERIA: 96, LIBYA: 97, LIECHTENSTEIN: 98, LITHUANIA: 99, LUXEMBOURG: 100,
    MADAGASCAR: 101, MALAWI: 102, MALAYSIA: 103, MALDIVES: 104, MALI: 105,
    MALTA: 106, MARSHALL_ISLANDS: 107, MAURITANIA: 108, MAURITIUS: 109, MEXICO: 110,
    MICRONESIA: 111, MOLDOVA: 112, MONACO: 113, MONGOLIA: 114, MONTENEGRO: 115,
    MOROCCO: 116, MOZAMBIQUE: 117, MYANMAR: 118, NAMIBIA: 119, NAURU: 120,
    NEPAL: 121, NETHERLANDS: 122, NEW_ZEALAND: 123, NICARAGUA: 124, NIGER: 125,
    NIGERIA: 126, NORTH_KOREA: 127, NORTH_MACEDONIA: 128, NORWAY: 129, OMAN: 130,
    PAKISTAN: 131, PALAU: 132, PALESTINE: 133, PANAMA: 134, PAPUA_NEW_GUINEA: 135,
    PARAGUAY: 136, PERU: 137, PHILIPPINES: 138, POLAND: 139, PORTUGAL: 140,
    QATAR: 141, ROMANIA: 142, RUSSIA: 143, RWANDA: 144, SAINT_KITTS_AND_NEVIS: 145,
    SAINT_LUCIA: 146, SAINT_VINCENT_AND_THE_GRENADINES: 147, SAMOA: 148, SAN_MARINO: 149, SAO_TOME_AND_PRINCIPE: 150,
    SAUDI_ARABIA: 151, SENEGAL: 152, SERBIA: 153, SEYCHELLES: 154, SIERRA_LEONE: 155,
    SINGAPORE: 156, SLOVAKIA: 157, SLOVENIA: 158, SOLOMON_ISLANDS: 159, SOMALIA: 160,
    SOUTH_AFRICA: 161, SOUTH_KOREA: 162, SOUTH_SUDAN: 163, SPAIN: 164, SRI_LANKA: 165,
    SUDAN: 166, SURINAME: 167, SWEDEN: 168, SWITZERLAND: 169, SYRIA: 170,
    TAJIKISTAN: 171, TANZANIA: 172, THAILAND: 173, TIMOR_LESTE: 174, TOGO: 175,
    TONGA: 176, TRINIDAD_AND_TOBAGO: 177, TUNISIA: 178, TURKEY: 179, TURKMENISTAN: 180,
    TUVALU: 181, UGANDA: 182, UKRAINE: 183, UNITED_ARAB_EMIRATES: 184, UNITED_KINGDOM: 185,
    UNITED_STATES: 186, URUGUAY: 187, UZBEKISTAN: 188, VANUATU: 189, VENEZUELA: 190,
    VIETNAM: 191, YEMEN: 192, ZAMBIA: 193, ZIMBABWE: 194, NULL: 195,
  },
  TimeOfDay: { Sunrise: 1, Daytime: 2, Sunset: 3, Dusk: 4, Night: 5, Null: 6 },
  Lighting:  { Natural: 1, Studio: 2, Mixed: 3, Null: 4 },
  ShotType: {
    Wide: 1, Full_Body: 2, Medium: 3, Close_Up: 4, Macro: 5,
    Over_the_Shoulder: 6, POV: 7, Aerial: 8, Null: 9,
  },
  DepthOfField: { Shallow: 1, Medium: 2, Deep: 3, Null: 4 },
  Weather: { Sunny: 1, Blue_Sky: 2, Cloudy: 3, Overcast: 4, Rainy: 5, Snowy: 6, Foggy: 7, Null: 8 },
  People: { Solo_Visitor: 1, Couple: 2, Duo: 3, Family: 4, Small_Group: 5, Crowd: 6, Queue: 7, Null: 8 },
  Guide:   { Yes: 1, No: 2, Unclear: 3 },
  PeopleActivity: {
    Observing: 1, Climbing: 2, Ascending: 3, Descending: 4, Swimming: 5, Floating: 6,
    Snorkeling: 7, Diving: 8, Rowing: 9, Sailing: 10, Speedboat_Riding: 11, Cycling: 12,
    Mountain_Biking: 13, Horse_Riding: 14, 'ATV Riding': 15, 'Go-Karting': 16, Snowmobiling: 17,
    Ziplining: 18, Paragliding: 19, Sky_Diving: 20, Hiking: 21, Trekking: 22, 'Rock Climbing': 23,
    Cooking: 24, 'Wine Tasting': 25, Crafting: 26, Dancing: 27, Yoga: 28, Meditation: 29,
    Performing: 30, Spectating_Show: 31, Eating: 32, Drinking: 33, Riding: 34, Null: 35,
  },
  Clothing: {
    Casual: 1, Formal: 2, Summer: 3, Winter: 4, Sportswear: 5, Outdoor_Gear: 6,
    Swimwear: 7, Traditional: 8, Uniform: 9, Costume: 10, Safety_Gear: 11, Null: 12,
  },
  Objects: { Wheelchair: 1, Headphones: 2, Audio_Device: 3, Phone: 4, Laptop: 5, Camera: 6, Null: 7 },
  Transport: {
    Car: 1, Bus: 2, Van: 3, Bicycle: 4, Motorcycle: 5, Scooter: 6, Train: 7, Tram: 8,
    Metro: 9, Funicular: 10, Segway: 11, Tuk_Tuk: 12, Horse_Carriage: 13, Gondola: 14,
    Traghetto: 15, Ferry: 16, Yacht: 17, Cruise_Ship: 18, Speedboat: 19, Catamaran: 20,
    Kayak: 21, Canoe: 22, SUP: 23, Raft: 24, Jet_Ski: 25, RIB: 26, Submarine: 27,
    Cable_Car: 28, Helicopter: 29, Hot_Air_Balloon: 30, Plane: 31, Zipline: 32, Null: 33,
  },
  OperatorBrand: {
    Big_Bus: 1, City_Sightseeing: 2, Tootbus: 3, Golden_Tours: 4, Gray_Line: 5,
    TopView: 6, City_Tour_Worldwide: 7, Turistik: 8, Vienna_Sightseeing: 9,
    CitySightseeing_Budapest: 10, City_Tour: 11, City_Circle: 12, Stadtrundfahrten: 13,
    Le_Grand_Tour: 14, Colorbus: 15, Open_Tour: 16, Hop_On_Hop_Off: 17, Sights_of_Athens: 18,
    Frankfurt_Sightseeing: 19, Red_Sightseeing: 20, DoDublin: 21, Bright_Bus_City_Tours: 22,
    Turibus: 23, FunVee: 24, Yellow_Balloon_City_Bus: 25, HopTour: 26, Die_Roten_Doppeldecker: 27,
    Lisbon_Sightseeing: 28, I_Love_Rome: 29, Ducktours: 30, Hippo_Tours: 31, Open_Bus: 32,
    City_Sights: 33, Red_Bus: 34, Aerobus: 35, Flibco: 36, RegioJet: 37, ATVO: 38, AlpyBus: 39,
    Terravision: 40, Shuttle_Direct: 41, SkyBus: 42, National_Express: 43, SIT_Bus_Shuttle: 44,
    Autostradale: 45, Lufthansa_Express_Bus: 46, Dublin_Express: 47, Newark_Airport_Express: 48,
    The_Airline: 49, Airport_Limousine_Bus: 50, GreenLine_Transfers: 51, Arlanda_Express: 52,
    Flytoget: 53, Gardermoen_Express: 54, Heathrow_Express: 55, Gatwick_Express: 56,
    Stansted_Express: 57, Leonardo_Express: 58, KLIA_Ekspres: 59, KLIA_Transit: 60,
    Narita_Express: 61, Airport_Express_Hong_Kong: 62, Pisamover: 63, Eurostar: 64,
    Trenitalia: 65, Italo: 66, Frecciarossa: 67, Malpensa_Express: 68, Bernina_Express: 69,
    Glacier_Express: 70, GoldenPass: 71, Gornergrat_Railway: 72, Sagano_Romantic_Train: 73,
    Brightline: 74, Campania_Express: 75, Trenord: 76, Rocky_Mountaineer: 77,
    West_Coast_Railway: 78, Grand_Canyon_Railway: 79, JR_East: 80, JR_Central: 81, JR_West: 82,
  },
  travelCardBrandName: {
    Headout: 1, Turbopass: 2, Go_City: 3, London_Pass: 4, Stockholm_Pass: 5,
    Prague_CoolPass: 6, Vienna_Pass: 7, Roma_Pass: 8, Omnia_Card: 9,
    Paris_Museum_Pass: 10, Barcelona_Card: 11, Berlin_WelcomeCard: 12, Lisboa_Card: 13,
    Oslo_Pass: 14, Copenhagen_Card: 15, IAmsterdam_City_Card: 16, Dubai_Pass: 17,
    Explorer_Pass: 18, All_Inclusive_Pass: 19, Go_Explorer_Pass: 20, Sightseeing_Pass: 21,
    New_York_Pass: 22, New_York_CityPASS: 23, San_Francisco_CityPASS: 24,
    Seattle_CityPASS: 25, Chicago_CityPASS: 26, Toronto_CityPASS: 27, Go_O_Card: 28,
    Smart_Destination_Pass: 29, iVenture_Card: 30, Go_Dubai_Pass: 31,
    Singapore_Tourist_Pass: 32, Hong_Kong_Tourist_Pass: 33, Japan_Rail_Pass: 34,
    Swiss_Travel_Pass: 35, Eurail_Pass: 36, Interrail_Pass: 37,
  },
  TransportAttribute: { Luxury: 1, Standard: 2, 'Double-decker': 3, 'Twin-hull': 4, 'Single-hull': 5, Null: 6 },
  Design: {
    Combo_Split: 1, 'Meeting Point': 2, Promo_Banner: 3, Show_Poster: 4, Menu: 5,
    Travel_Card: 6, Exhibition_Pamphlet: 7, Generic_Design: 8, AI_Generated: 9, Null: 10,
  },
};

// ---------------------------------------------------------------------------
// Free-text tag → sentence template
// Must match both at seed time (ingestion) and search time (query building).
// ---------------------------------------------------------------------------

const PARAGRAPH_TEMPLATES: Record<string, string> = {
  PoiName:     'The point of interest in this media is {value}.',
  Environment: 'The environment of this scene is {value}.',
  City:        'This media was captured in the city of {value}.',
  Food:        'The food shown in this media is {value}.',
  Drinks:      'The drink visible in this media is {value}.',
  Wildlife:    'The wildlife visible in this media is {value}.',
  Artwork:     'The artwork depicted in this media is {value}.',
  Artist:      'The artist associated with this media is {value}.',
};

/**
 * Builds a combined paragraph from a map of free-text tag name → value.
 * Must be called identically at ingestion time AND search time.
 */
export function buildCombinedParagraph(freeTextTags: Record<string, string>): string {
  const sentences: string[] = [];
  for (const [name, value] of Object.entries(freeTextTags)) {
    const template = PARAGRAPH_TEMPLATES[name];
    if (template && value) {
      sentences.push(template.replace('{value}', value));
    }
  }
  return sentences.join(' ');
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export class MariaDbQdrantModel implements IPocModel {
  readonly name = PocModelType.MARIADB_QDRANT;

  // ========================================================================
  // MIGRATE  (drop → create → seed)
  // ========================================================================

  async migrate(data: SeedMedia[]): Promise<void> {
    const client = getQdrantClient();

    // Drop existing collection if present
    const { collections } = await client.getCollections();
    if (collections.some((c) => c.name === QDRANT_COLLECTION)) {
      await client.deleteCollection(QDRANT_COLLECTION);
    }

    // Create collection with 1536-dim cosine vectors
    await client.createCollection(QDRANT_COLLECTION, {
      vectors: { size: VECTOR_DIM, distance: 'Cosine' },
    });

    // Create INTEGER payload indexes on all fixed-tag fields + media_id
    const indexFields = ['media_id', ...Object.values(FIXED_TAG_FIELD)];
    for (const field of indexFields) {
      await client.createPayloadIndex(QDRANT_COLLECTION, {
        field_name: field,
        field_schema: 'integer',
      });
    }

    await this.seed(data);
  }

  // ========================================================================
  // SEED
  // ========================================================================

  async seed(data: SeedMedia[]): Promise<void> {
    if (data.length === 0) return;

    // ── Step 1: Fetch all media ids from MariaDB ──────────────────────────
    const urlToId = new Map<string, number>();
    const URL_BATCH = 5_000;
    const allUrls = data.map((d) => d.mediaUrl);
    for (const chunk of chunkArray(allUrls, URL_BATCH)) {
      const placeholders = chunk.map(() => '?').join(', ');
      const rows = await queryMariaDb<{ id: number; url: string }>(
        `SELECT id, url FROM media WHERE url IN (${placeholders})`,
        chunk
      );
      for (const r of rows) urlToId.set(r.url, r.id);
    }

    // ── Step 2: Build point data for every media item ─────────────────────
    type PointData = {
      mediaId: number;
      url: string;
      visualQaScore: number;
      combinedText: string;
      fixedFields: Record<string, number>;
    };

    const pointDataList: PointData[] = [];

    for (const item of data) {
      const mediaId = urlToId.get(item.mediaUrl);
      if (mediaId === undefined) continue;

      const freeTextMap: Record<string, string> = {};
      const fixedFields: Record<string, number> = {};

      for (const tag of item.tags) {
        if (tag.type === 'FREE_TEXT') {
          if (tag.value) freeTextMap[tag.name] = tag.value;
        } else {
          const fieldName = FIXED_TAG_FIELD[tag.name];
          const valueMap = FIXED_TAG_VALUE_MAP[tag.name];
          if (fieldName && valueMap) {
            const intVal = valueMap[tag.value] ?? valueMap[tag.values?.[0]] ?? 0;
            if (intVal > 0) fixedFields[fieldName] = intVal;
          }
        }
      }

      const combinedText = buildCombinedParagraph(freeTextMap);

      pointDataList.push({
        mediaId,
        url: item.mediaUrl,
        visualQaScore: item.visualQaScore,
        combinedText,
        fixedFields,
      });
    }

    if (pointDataList.length === 0) return;

    // ── Step 3: Embed all combined paragraphs in chunks of 500 ───────────
    const EMBED_CHUNK = 500;
    const allTexts = pointDataList.map((p) => p.combinedText || ' ');
    const allEmbeddings: number[][] = [];
    for (const chunk of chunkArray(allTexts, EMBED_CHUNK)) {
      const embeddings = await getEmbeddings(chunk);
      allEmbeddings.push(...embeddings);
    }

    // ── Step 4: Upsert to Qdrant in batches of 100 ───────────────────────
    const UPSERT_BATCH = 100;
    for (let start = 0; start < pointDataList.length; start += UPSERT_BATCH) {
      const chunkData = pointDataList.slice(start, start + UPSERT_BATCH);
      await getQdrantClient().upsert(QDRANT_COLLECTION, {
        points: chunkData.map((p, idx) => ({
          id: p.mediaId,
          vector: allEmbeddings[start + idx],
          payload: {
            media_id:        p.mediaId,
            url:             p.url,
            visual_qa_score: p.visualQaScore,
            combined_text:   p.combinedText,
            ...p.fixedFields,
          },
        })),
      });
    }
  }

  // ========================================================================
  // SEARCH
  // ========================================================================

  async search(rawTags: unknown[], minQaScore = 0): Promise<Poc1MediaResult[]> {
    const tags = rawTags as Poc1SearchTag[];

    // ── Step 0: Classify tags ──────────────────────────────────────────────
    const mTags  = tags.filter((t) => t.type === 'FIXED' && t.isMandatory === true);
    const nmTags = tags.filter((t) => t.type === 'FIXED' && !t.isMandatory);
    const ftTags = tags.filter((t) => t.type === 'FREE_TEXT');

    // ── Step 1: Build query vector from free-text tags ─────────────────────
    let queryVector: number[] | null = null;
    if (ftTags.length > 0) {
      const freeTextMap: Record<string, string> = {};
      for (const tag of ftTags) {
        // tag.values is a comma-separated string in Poc1SearchTag
        freeTextMap[tag.name] = tag.values;
      }
      const paragraph = buildCombinedParagraph(freeTextMap);
      if (paragraph.trim()) {
        queryVector = await getEmbedding(paragraph);
      }
    }

    // ── Step 2: Build Qdrant must-filter from mandatory fixed tags ─────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mustConditions: any[] = mTags.flatMap((tag) => {
      const fieldName = FIXED_TAG_FIELD[tag.name];
      const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
      if (!fieldName || !valueMap) return [];

      // tag.values is comma-separated; each value becomes its own must condition
      return tag.values
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => {
          const intVal = valueMap[v] ?? 0;
          return { key: fieldName, match: { value: intVal } };
        });
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qdrantFilter: any | undefined =
      mustConditions.length > 0 ? { must: mustConditions } : undefined;

    // ── Step 2a: Always scroll all M-filtered candidates (NM candidate pool) ─
    // Fetching up to 1000 ensures all NM-matching documents are captured before
    // in-app NM scoring, regardless of whether free-text tags are also present.
    // Using a single large scroll (rather than limit 50) mirrors the Elastic
    // model's size:1000 M-filter query.
    type QdrantHit = {
      id: number;
      score: number;  // cosine similarity from KNN; 0 for scroll-only hits
      payload: Record<string, unknown>;
    };

    const { points } = await getQdrantClient().scroll(QDRANT_COLLECTION, {
      filter: qdrantFilter,
      limit: 1000,
      with_payload: true,
      with_vector: false,
    });

    // Seed the merged doc map from the scroll results (knnScore starts at 0).
    const allDocs = new Map<number, QdrantHit>();
    for (const p of points) {
      const id = p.id as number;
      allDocs.set(id, {
        id,
        score:   0,
        payload: (p.payload ?? {}) as Record<string, unknown>,
      });
    }

    // ── Step 2b: If free-text tags present, run KNN and merge scores ──────────
    // KNN results are merged into allDocs so each document carries both an NM
    // score (from payload inspection) and a vector score (from cosine KNN).
    // Documents in KNN results but not in the scroll (edge case with M-filters)
    // are also added to ensure completeness.
    if (queryVector) {
      const knnResults = await getQdrantClient().search(QDRANT_COLLECTION, {
        vector:       queryVector,
        filter:       qdrantFilter,
        limit:        200,
        with_payload: true,
        with_vector:  false,
      });
      for (const r of knnResults) {
        const id       = r.id as number;
        const existing = allDocs.get(id);
        if (existing) {
          existing.score = r.score;
        } else {
          allDocs.set(id, {
            id,
            score:   r.score,
            payload: (r.payload ?? {}) as Record<string, unknown>,
          });
        }
      }
    }

    if (allDocs.size === 0) return [];
    const hits = Array.from(allDocs.values());

    // ── Step 3: Compute NM score from payload ─────────────────────────────
    // Build a flat list of { fieldName, intValue } pairs — one per NM tag value
    // term — so multi-value tags are counted individually. This matches the
    // approach in the Elastic model and ensures totalNmValues reflects the true
    // maximum possible match count.
    const nmTagMatches: { fieldName: string; intValue: number }[] =
      nmTags.flatMap((tag) => {
        const fieldName = FIXED_TAG_FIELD[tag.name];
        const valueMap  = FIXED_TAG_VALUE_MAP[tag.name];
        if (!fieldName || !valueMap) return [];
        return tag.values
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
          .flatMap((v) => {
            const intValue = valueMap[v];
            return intValue !== undefined ? [{ fieldName, intValue }] : [];
          });
      });
    const totalNmValues = nmTagMatches.length;

    type ScoredHit = QdrantHit & { nmScore: number };
    const scored: ScoredHit[] = hits.map((hit) => ({
      ...hit,
      nmScore: nmTagMatches.filter(({ fieldName, intValue }) =>
        Number(hit.payload[fieldName]) === intValue
      ).length,
    }));

    // ── Step 4: Normalize scores and compute finalScore ────────────────────
    // nmScoreNorm  ∈ [0, 1]: nmScore / totalNmValues
    // vectorScoreNorm ∈ [0, 1]: Qdrant cosine similarity is already in this range
    //
    // finalScore weights:
    //   NM + FT  →  0.5 × nmScoreNorm + 0.5 × vectorScoreNorm
    //   NM only  →  nmScoreNorm
    //   FT only  →  vectorScoreNorm
    //   neither  →  0  (fall through to visualQaScore tiebreak)
    const hasNm = totalNmValues > 0;
    const hasFt = queryVector !== null;

    type RankedHit = ScoredHit & { finalScore: number };
    const ranked: RankedHit[] = scored.map((h) => {
      const nmScoreNorm     = hasNm ? h.nmScore / totalNmValues : 0;
      const vectorScoreNorm = h.score; // cosine similarity already in [0, 1]

      let finalScore: number;
      if (hasNm && hasFt)  finalScore = 0.5 * nmScoreNorm + 0.5 * vectorScoreNorm;
      else if (hasNm)      finalScore = nmScoreNorm;
      else if (hasFt)      finalScore = vectorScoreNorm;
      else                 finalScore = 0;

      return { ...h, finalScore };
    });

    ranked.sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      const qaA = (a.payload.visual_qa_score as number) ?? 0;
      const qaB = (b.payload.visual_qa_score as number) ?? 0;
      return qaB - qaA;
    });

    // ── Step 5: Apply minQaScore filter, return top 50 ────────────────────
    const top = ranked
      .filter((h) => ((h.payload.visual_qa_score as number) ?? 0) >= minQaScore)
      .slice(0, 50);

    const tagsByMedia = await fetchAllTags(top.map((h) => h.id));

    return top.map((h) => ({
      id: h.id,
      url: (h.payload.url as string) ?? '',
      visualQaScore: (h.payload.visual_qa_score as number) ?? 0,
      tags: tagsByMedia.get(h.id) ?? [],
      finalRank: Math.round(h.finalScore * 10000) / 10000,
    }));
  }
}
