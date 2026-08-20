const DEFAULT_SUPABASE_URL = "https://prfimgfuebmhculkbewo.supabase.co";

function getConfig() {
  const url = (process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    const err = new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY trên Vercel.");
    err.code = "missing_supabase_service_role";
    throw err;
  }

  return { url, serviceRoleKey };
}

async function request(path, options) {
  const cfg = getConfig();
  const opts = options || {};
  const headers = Object.assign(
    {
      apikey: cfg.serviceRoleKey,
      Authorization: "Bearer " + cfg.serviceRoleKey,
      "Content-Type": "application/json"
    },
    opts.headers || {}
  );

  const response = await fetch(cfg.url + path, {
    method: opts.method || "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body)
  });

  const raw = await response.text();
  let data = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }

  if (!response.ok) {
    const err = new Error(
      (data && (data.hint || data.message || data.error_description)) ||
      `Supabase request failed (${response.status})`
    );
    err.code = (data && (data.message || data.code)) || `supabase_${response.status}`;
    err.status = response.status;
    err.details = data;
    throw err;
  }

  return data;
}

function tablePath(table, query) {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  return "/rest/v1/" + table + qs;
}

async function insert(table, row) {
  return request(tablePath(table), {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row
  });
}

async function selectOne(table, query) {
  const rows = await request(tablePath(table, query), { method: "GET" });
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function update(table, filters, values) {
  return request(tablePath(table, filters), {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: values
  });
}

async function rpc(name, payload) {
  return request("/rest/v1/rpc/" + encodeURIComponent(name), {
    method: "POST",
    body: payload || {}
  });
}

module.exports = { insert, selectOne, update, rpc };
