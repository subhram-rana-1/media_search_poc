import { NextRequest, NextResponse } from 'next/server';
import {
  PocModelType,
  Poc1SearchTag,
  Poc1MediaResult,
  Poc1SearchResponse,
  SearchResponse,
  MediaResult,
} from '@/types';
import { getModel } from '@/poc-models/registry';
import { MariaDbOnlyModel } from '@/poc-models/mariadb-only.model';

export async function POST(request: NextRequest) {
  const start = Date.now();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { pocModel } = body;

  if (!pocModel || !Object.values(PocModelType).includes(pocModel)) {
    return NextResponse.json(
      {
        error: `Invalid or missing pocModel. Valid values: ${Object.values(PocModelType).join(', ')}`,
      },
      { status: 400 }
    );
  }

  try {
    // ── MariaDB-only (POC-1) uses its own contract ──────────────────────
    if (pocModel === PocModelType.MARIADB_ONLY) {
      return await handlePoc1(body, pocModel, start);
    }

    // ── Generic contract for other models ───────────────────────────────
    return await handleGeneric(body, pocModel, start);
  } catch (err) {
    console.error('[/api/search] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// POC-1 handler
// ---------------------------------------------------------------------------

async function handlePoc1(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  pocModel: PocModelType,
  start: number
) {
  const mediaTags: Poc1SearchTag[] | undefined = body.mediaTags;

  if (!Array.isArray(mediaTags) || mediaTags.length === 0) {
    return NextResponse.json(
      { error: 'mediaTags must be a non-empty array' },
      { status: 400 }
    );
  }

  // Validate: FREE_TEXT + isMandatory=true → 400
  for (const tag of mediaTags) {
    if (tag.type === 'FREE_TEXT' && tag.isMandatory === true) {
      return NextResponse.json(
        {
          error: `Tag "${tag.name}": isMandatory=true is invalid for FREE_TEXT tags`,
        },
        { status: 400 }
      );
    }
    if (!tag.name || !tag.type || tag.values === undefined) {
      return NextResponse.json(
        { error: 'Each tag must have name, type, and values' },
        { status: 400 }
      );
    }
    if (!['FIXED', 'FREE_TEXT'].includes(tag.type)) {
      return NextResponse.json(
        { error: `Invalid tag type: "${tag.type}". Must be FIXED or FREE_TEXT` },
        { status: 400 }
      );
    }
  }

  const minQaScore: number =
    typeof body.minQaScore === 'number'
      ? Math.min(1, Math.max(0, body.minQaScore))
      : 0;

  const model = getModel(pocModel) as MariaDbOnlyModel;
  const results = (await model.search(mediaTags, minQaScore)) as Poc1MediaResult[];

  const response: Poc1SearchResponse & { pocModel: string; durationMs: number } = {
    medias: results,
    pocModel,
    durationMs: Date.now() - start,
  };

  return NextResponse.json(response);
}

// ---------------------------------------------------------------------------
// Generic handler (Qdrant, Elastic, etc.)
// ---------------------------------------------------------------------------

async function handleGeneric(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any,
  pocModel: PocModelType,
  start: number
) {
  const { tags } = body;

  if (!Array.isArray(tags)) {
    return NextResponse.json(
      { error: 'tags must be an array' },
      { status: 400 }
    );
  }

  const model = getModel(pocModel);
  const results = (await model.search(tags)) as MediaResult[];

  const response: SearchResponse = {
    results,
    pocModel,
    durationMs: Date.now() - start,
  };

  return NextResponse.json(response);
}
