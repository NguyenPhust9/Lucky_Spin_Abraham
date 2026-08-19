const crypto = require("crypto");

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

module.exports = async function handler(req, res) {
  const appId = process.env.ZALO_APP_ID;
  const redirectUri = process.env.ZALO_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return res.status(500).json({
      ok: false,
      message: "Thiếu ZALO_APP_ID hoặc ZALO_REDIRECT_URI trong Vercel."
    });
  }

  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash("sha256").update(codeVerifier).digest()
  );
  const state = base64url(crypto.randomBytes(24));

  const cookieOptions = "Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600";

  res.setHeader("Set-Cookie", [
    `zalo_code_verifier=${codeVerifier}; ${cookieOptions}`,
    `zalo_oauth_state=${state}; ${cookieOptions}`
  ]);

  const url = new URL("https://oauth.zaloapp.com/v4/permission");
  url.searchParams.set("app_id", appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("state", state);

  res.writeHead(302, { Location: url.toString() });
  res.end();
};
