function parseBody(req) {
  if (!req || req.body == null) return {};
  if (typeof req.body === "object") return req.body;
  try {
    return JSON.parse(String(req.body));
  } catch {
    return {};
  }
}

function sendJson(res, status, payload, extraHeaders) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (extraHeaders) {
    Object.keys(extraHeaders).forEach((key) => {
      res.setHeader(key, extraHeaders[key]);
    });
  }

  res.end(JSON.stringify(payload));
}

module.exports = { parseBody, sendJson };
