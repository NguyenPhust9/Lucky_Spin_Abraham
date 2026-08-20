const crypto = require("crypto");
const { parseBody, sendJson } = require("../lib/http");
const { normalizeVietnamPhone } = require("../lib/phone");
const { insert } = require("../lib/supabase-server");

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function sanitizeFormData(input) {
  const data = input && typeof input === "object" ? input : {};

  return {
    name: cleanText(data.name, 120),
    phone: cleanText(data.phone, 20),
    address: cleanText(data.address, 300),
    store: cleanText(data.store, 120),
    product: cleanText(data.product, 180)
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      ok: false,
      code: "method_not_allowed",
      message: "Method not allowed"
    });
  }

  try {
    const body = parseBody(req);
    const phone = normalizeVietnamPhone(body.phone);

    if (!phone) {
      return sendJson(res, 400, {
        ok: false,
        code: "invalid_phone",
        message: "Số điện thoại chưa đúng định dạng."
      });
    }

    const miniAppId = process.env.ZALO_MINI_APP_ID;

    if (!miniAppId) {
      return sendJson(res, 500, {
        ok: false,
        code: "missing_zalo_mini_app_id",
        message: "Thiếu ZALO_MINI_APP_ID trên Vercel."
      });
    }

    const verificationId = crypto.randomUUID();

    const expiresAt = new Date(
      Date.now() + 15 * 60 * 1000
    ).toISOString();

    const formData = sanitizeFormData(body.formData);
    formData.phone = phone;

    await insert("abraham_phone_verifications", {
      id: verificationId,
      expected_phone: phone,
      status: "pending",
      form_data: formData,
      expires_at: expiresAt
    });

    const zaloUrl =
      "https://zalo.me/s/" +
      encodeURIComponent(String(miniAppId)) +
      "/?env=DEVELOPMENT" +
      "&version=zdev-3f7f39d8" +
      "&verification=" +
      encodeURIComponent(verificationId);

    return sendJson(res, 200, {
      ok: true,
      verificationId,
      expiresAt,
      zaloUrl
    });
  } catch (error) {
    console.error(
      "[ZaloVerifyStart]",
      error.code || error.message
    );

    return sendJson(res, error.status || 500, {
      ok: false,
      code: error.code || "server_error",
      message:
        error.message ||
        "Không tạo được phiên xác minh Zalo."
    });
  }
};