import { NextRequest, NextResponse } from 'next/server';
import { PocModelType, SearchRequest, SearchResponse } from '@/types';
import { getModel } from '@/poc-models/registry';

export async function POST(request: NextRequest) {
  const start = Date.now();

  let body: SearchRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 }
    );
  }

  const { pocModel, tags } = body;

  if (!pocModel || !Object.values(PocModelType).includes(pocModel)) {
    return NextResponse.json(
      {
        error: `Invalid or missing pocModel. Valid values: ${Object.values(PocModelType).join(', ')}`,
      },
      { status: 400 }
    );
  }

  if (!Array.isArray(tags)) {
    return NextResponse.json(
      { error: 'tags must be an array' },
      { status: 400 }
    );
  }

  try {
    const model = getModel(pocModel);
    const results = await model.search(tags);

    const response: SearchResponse = {
      results,
      pocModel,
      durationMs: Date.now() - start,
    };

    return NextResponse.json(response);
  } catch (err) {
    console.error('[/api/search] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
