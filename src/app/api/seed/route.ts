import { NextRequest, NextResponse } from 'next/server';
import { runSeed } from '@/database/seed/seeder';

/**
 * POST /api/seed
 * Body (optional): { "model": "mariadb-only" }  — omit to seed all models
 */
export async function POST(request: NextRequest) {
  let targetModel: string | undefined;

  try {
    const body = await request.json().catch(() => ({}));
    targetModel = body?.model;
  } catch {
    // no body is fine
  }

  try {
    const results = await runSeed(targetModel);
    const allOk = results.every((r) => r.success);

    return NextResponse.json(
      { results },
      { status: allOk ? 200 : 207 }
    );
  } catch (err) {
    console.error('[/api/seed] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
