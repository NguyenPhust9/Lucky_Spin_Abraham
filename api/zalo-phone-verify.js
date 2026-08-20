const { parseBody, sendJson } = require("../lib/http");
const { normalizeVietnamPhone, maskPhone } = require("../lib/phone");
const { selectOne, update } = require("../lib/supabase-server");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    Object.entries(corsHeaders()).forEach(([key, value]) => res.setHeader(key, value));
    return res.end();
  }

  if (req.method !== "POST") {
    return sendJson(
      res,
      405,
      { ok: false, code: "method_not_allowed", message: "Method not allowed" },
      corsHeaders()
    );
  }

  try {
    const body = parseBody(req);
    const verificationId = String(body.verificationId || "").trim();
    const phoneToken = String(body.phoneToken || "").trim();
    const accessToken = String(body.accessToken || "").trim();

    if (!/^[0-9a-f-]{36}$/i.test(verificationId) || !phoneToken || !accessToken) {
      return sendJson(
        res,
        400,
        {
          ok: false,
          code: "invalid_request",
          message: "Thiếu dữ liệu xác minh từ Zalo."
        },
        corsHeaders()
      );
    }

    const appSecret = process.env.ZALO_APP_SECRET;
    if (!appSecret) {
      return sendJson(
        res,
        500,
        {
          ok: false,
          code: "missing_zalo_secret",
          message: "Thiếu ZALO_APP_SECRET trên Vercel."
        },
        corsHeaders()
      );
    }

    const row = await selectOne("abraham_phone_verifications", {
      select: "id,expected_phone,verified_phone,status,expires_at,used_at",
      id: "eq." + verificationId,
      limit: "1"
    });

    if (!row) {
      return sendJson(
        res,
        404,
        {
          ok: false,
          code: "verification_not_found",
          message: "Không tìm thấy phiên xác minh."
        },
        corsHeaders()
      );
    }

    if (row.used_at) {
      return sendJson(
        res,
        409,
        {
          ok: false,
          code: "verification_used",
          message: "Phiên xác minh này đã được sử dụng."
        },
        corsHeaders()
      );
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await update(
        "abraham_phone_verifications",
        { id: "eq." + verificationId },
        { status: "expired" }
      );

      return sendJson(
        res,
        410,
        {
          ok: false,
          code: "verification_expired",
          message: "Phiên xác minh đã hết hạn. Vui lòng quay lại website và thử lại."
        },
        corsHeaders()
      );
    }

    if (row.status === "verified" && row.verified_phone === row.expected_phone) {
      const siteUrl = (process.env.ABRAHAM_SITE_URL || "https://uu-dai-abraham-delta.vercel.app").replace(/\/+$/, "");
      return sendJson(
        res,
        200,
        {
          ok: true,
          verified: true,
          phone: maskPhone(row.verified_phone),
          returnUrl: siteUrl + "/?zalo_verification=" + encodeURIComponent(verificationId) + "#vong-quay"
        },
        corsHeaders()
      );
    }

    const zaloResponse = await fetch("https://graph.zalo.me/v2.0/me/info", {
      method: "GET",
      headers: {
        access_token: accessToken,
        code: phoneToken,
        secret_key: appSecret
      }
    });

    const zaloData = await zaloResponse.json().catch(() => ({}));
    const zaloPhone = normalizeVietnamPhone(
      zaloData && zaloData.data ? zaloData.data.number : ""
    );

    if (!zaloResponse.ok || Number(zaloData.error || 0) !== 0 || !zaloPhone) {
      const zaloMessage = zaloData.message || "Zalo không trả về số điện thoại hợp lệ.";
      return sendJson(
        res,
        400,
        {
          ok: false,
          code: "zalo_phone_decode_failed",
          message: zaloMessage
        },
        corsHeaders()
      );
    }

    if (zaloPhone !== row.expected_phone) {
      return sendJson(
        res,
        409,
        {
          ok: false,
          code: "phone_mismatch",
          message: "Số điện thoại trên Zalo không trùng với số đã nhập trên website."
        },
        corsHeaders()
      );
    }

    const verifiedAt = new Date().toISOString();
    await update(
      "abraham_phone_verifications",
      { id: "eq." + verificationId },
      {
        status: "verified",
        verified_phone: zaloPhone,
        verified_at: verifiedAt
      }
    );

    const siteUrl = (process.env.ABRAHAM_SITE_URL || "https://uu-dai-abraham-delta.vercel.app").replace(/\/+$/, "");

    return sendJson(
      res,
      200,
      {
        ok: true,
        verified: true,
        phone: maskPhone(zaloPhone),
        returnUrl: siteUrl + "/?zalo_verification=" + encodeURIComponent(verificationId) + "#vong-quay"
      },
      corsHeaders()
    );
  } catch (error) {
    console.error("[ZaloPhoneVerify]", error.code || error.message);
    return sendJson(
      res,
      error.status || 500,
      {
        ok: false,
        code: error.code || "server_error",
        message: error.message || "Lỗi máy chủ khi xác minh số điện thoại Zalo."
      },
      corsHeaders()
    );
  }
};
