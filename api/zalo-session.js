const crypto = require("crypto");

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const out = {};

  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;

    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();

    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  });

  return out;
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function safeEqual(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);

  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
}

module.exports = async function handler(req, res) {
  const secret = process.env.ZALO_APP_SECRET;

  if (!secret) {
    return res.status(500).json({
      ok: false,
      loggedIn: false,
      message: "Thiếu ZALO_APP_SECRET."
    });
  }

  const cookies = parseCookies(req);
  const session = cookies.zalo_session;

  if (!session || !session.includes(".")) {
    return res.status(200).json({
      ok: true,
      loggedIn: false
    });
  }

  try {
    const [payload, signature] = session.split(".");

    const expected = base64url(
      crypto
        .createHmac("sha256", secret)
        .update(payload)
        .digest()
    );

    if (!safeEqual(signature, expected)) {
      return res.status(200).json({
        ok: true,
        loggedIn: false
      });
    }

    const json = Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("utf8");

    const user = JSON.parse(json);

    if (
      !user.id ||
      !user.exp ||
      user.exp < Math.floor(Date.now() / 1000)
    ) {
      return res.status(200).json({
        ok: true,
        loggedIn: false
      });
    }

    return res.status(200).json({
      ok: true,
      loggedIn: true,
      user: {
        id: String(user.id),
        name: user.name || "",
        picture: user.picture || ""
      }
    });
  } catch (error) {
    return res.status(200).json({
      ok: true,
      loggedIn: false
    });
  }
};
