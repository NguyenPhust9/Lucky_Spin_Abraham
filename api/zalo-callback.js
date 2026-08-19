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

function createSession(user, secret) {
  const payloadObject = {
    id: String(user.id),
    name: user.name || "",
    picture:
      user.picture &&
      user.picture.data &&
      user.picture.data.url
        ? user.picture.data.url
        : "",
    exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60
  };

  const payload = base64url(
    Buffer.from(JSON.stringify(payloadObject), "utf8")
  );

  const signature = base64url(
    crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest()
  );

  return `${payload}.${signature}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      message: "Method not allowed"
    });
  }

  const appId = process.env.ZALO_APP_ID;
  const appSecret = process.env.ZALO_APP_SECRET;

  if (!appId || !appSecret) {
    return res.status(500).json({
      ok: false,
      message: "Thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET trong Vercel."
    });
  }

  const code = String(req.query.code || "");
  const state = String(req.query.state || "");

  if (!code || !state) {
    return res.status(400).json({
      ok: false,
      message: "Zalo không trả về code/state hợp lệ."
    });
  }

  const cookies = parseCookies(req);
  const savedState = cookies.zalo_oauth_state;
  const codeVerifier = cookies.zalo_code_verifier;

  if (!savedState || state !== savedState) {
    return res.status(400).json({
      ok: false,
      message: "State không hợp lệ. Vui lòng đăng nhập Zalo lại."
    });
  }

  if (!codeVerifier) {
    return res.status(400).json({
      ok: false,
      message: "Không tìm thấy code_verifier. Vui lòng đăng nhập Zalo lại."
    });
  }

  try {
    // 1) Đổi authorization code lấy User Access Token
    const body = new URLSearchParams();
    body.set("code", code);
    body.set("app_id", appId);
    body.set("grant_type", "authorization_code");
    body.set("code_verifier", codeVerifier);

    const tokenResponse = await fetch(
      "https://oauth.zaloapp.com/v4/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "secret_key": appSecret
        },
        body
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("[Zalo] Token exchange failed:", tokenData);

      return res.status(400).json({
        ok: false,
        message:
          tokenData.error_description ||
          tokenData.message ||
          "Không lấy được Zalo access token.",
        zalo_error: tokenData.error || null
      });
    }

    // 2) Lấy profile Zalo: id, name, picture
    // Zalo SDK chính thức truyền User Access Token bằng header "access_token".
    const profileUrl = new URL(
      "https://graph.zalo.me/v2.0/me"
    );

    profileUrl.searchParams.set(
      "fields",
      "id,name,picture"
    );

    const profileResponse = await fetch(
      profileUrl.toString(),
      {
        method: "GET",
        headers: {
          "access_token": tokenData.access_token
        }
      }
    );

    const profile = await profileResponse.json();

    if (!profileResponse.ok || !profile.id) {
      console.error("[Zalo] Get profile failed:", profile);

      return res.status(400).json({
        ok: false,
        message:
          profile.message ||
          "Không lấy được thông tin tài khoản Zalo."
      });
    }

    // 3) Tạo session ký bằng ZALO_APP_SECRET.
    // Không đưa access token/refresh token xuống trình duyệt.
    const session = createSession(profile, appSecret);

    res.setHeader("Set-Cookie", [
      `zalo_session=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
      "zalo_code_verifier=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
      "zalo_oauth_state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    ]);

    return res.status(200).json({
      ok: true,
      user: {
        id: String(profile.id),
        name: profile.name || "",
        picture:
          profile.picture &&
          profile.picture.data &&
          profile.picture.data.url
            ? profile.picture.data.url
            : ""
      }
    });
  } catch (error) {
    console.error("[Zalo] Callback error:", error);

    return res.status(500).json({
      ok: false,
      message: "Lỗi máy chủ khi xác thực Zalo."
    });
  }
};
