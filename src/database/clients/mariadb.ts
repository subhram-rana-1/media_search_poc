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
