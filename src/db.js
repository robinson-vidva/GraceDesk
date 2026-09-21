// Thin helpers over Cloudflare D1. `db` is the env.DB binding.

export async function one(db, sql, ...params) {
  return db.prepare(sql).bind(...params).first();
}

export async function all(db, sql, ...params) {
  const { results } = await db.prepare(sql).bind(...params).all();
  return results ?? [];
}

export async function run(db, sql, ...params) {
  return db.prepare(sql).bind(...params).run();
}

// INSERT helper that returns the new row id.
export async function insert(db, sql, ...params) {
  const res = await db.prepare(sql).bind(...params).run();
  return res.meta?.last_row_id;
}
