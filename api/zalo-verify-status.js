const { sendJson } = require("../lib/http");
const { selectOne, update } = require("../lib/supabase-server");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return sendJson(res, 405, {
      ok: false,
      code: "method_not_allowed",
      message: "Method not allowed"
    });
  }

  try {
    const id = String((req.query && req.query.id) || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return sendJson(res, 400, {
        ok: false,
        code: "invalid_verification_id",
        message: "Mã phiên xác minh không hợp lệ."
      });
    }

    const row = await selectOne("abraham_phone_verifications", {
      select: "id,expected_phone,verified_phone,status,form_data,expires_at,verified_at,used_at",
      id: "eq." + id,
      limit: "1"
    });

    if (!row) {
      return sendJson(res, 404, {
        ok: false,
        code: "verification_not_found",
        message: "Không tìm thấy phiên xác minh."
      });
    }

    if (row.used_at) {
      return sendJson(res, 200, {
        ok: true,
        status: "used",
        verified: false,
        used: true
      });
    }

    const expired = new Date(row.expires_at).getTime() <= Date.now();
    if (expired && row.status !== "expired") {
      await update(
        "abraham_phone_verifications",
        { id: "eq." + id },
        { status: "expired" }
      );
      row.status = "expired";
    }

    const verified = row.status === "verified" && !expired;

    return sendJson(res, 200, {
      ok: true,
      status: row.status,
      verified,
      expectedPhone: row.expected_phone,
      phone: verified ? row.verified_phone : row.expected_phone,
      formData: row.form_data || {},
      expiresAt: row.expires_at,
      verifiedAt: row.verified_at || null
    });
  } catch (error) {
    console.error("[ZaloVerifyStatus]", error.code || error.message);
    return sendJson(res, error.status || 500, {
      ok: false,
      code: error.code || "server_error",
      message: error.message || "Không kiểm tra được phiên xác minh Zalo."
    });
  }
};
