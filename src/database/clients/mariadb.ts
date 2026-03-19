import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

export function getMariaDbPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.MARIADB_HOST ?? 'localhost',
      port: Number(process.env.MARIADB_PORT ?? 3306),
      user: process.env.MARIADB_USER ?? 'root',
      password: process.env.MARIADB_PASSWORD ?? '',
      database: process.env.MARIADB_DATABASE ?? 'media_search',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

export async function queryMariaDb<T = unknown>(
  sql: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any[]
): Promise<T[]> {
  const conn = getMariaDbPool();
  const [rows] = await conn.execute(sql, params);
  return rows as T[];
}

/**
 * Acquire a single connection from the pool, run the callback, then release.
 * Use this for DDL sequences (DROP TABLE, CREATE TABLE, SET FOREIGN_KEY_CHECKS,
 * etc.) so that all statements execute on the same connection and
 * session-level settings like FOREIGN_KEY_CHECKS actually take effect.
 */
export async function withConnection(
  fn: (conn: mysql.PoolConnection) => Promise<void>
): Promise<void> {
  const conn = await getMariaDbPool().getConnection();
  try {
    await fn(conn);
  } finally {
    conn.release();
  }
}
