import { NextRequest, NextResponse } from 'next/server';
import { runMigration } from '@/database/seed/seeder';

/**
 * POST /api/migrate
 * Body (optional): { "model": "mariadb-only" }  — omit to migrate all models
 *
 * Drops all tables, recreates the schema, then seeds fresh data.
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
    const results = await runMigration(targetModel);
    const allOk = results.every((r) => r.success);

    return NextResponse.json(
      { results },
      { status: allOk ? 200 : 207 }
    );
  } catch (err) {
    console.error('[/api/migrate] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
