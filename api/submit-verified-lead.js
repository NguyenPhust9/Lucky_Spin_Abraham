const { parseBody, sendJson } = require("../lib/http");
const { normalizeVietnamPhone } = require("../lib/phone");
const { selectOne, update, rpc } = require("../lib/supabase-server");

function cleanText(value, max) {
  return String(value || "").trim().slice(0, max);
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
    const verificationId = String(body.verificationId || "").trim();
    const phone = normalizeVietnamPhone(body.phone);
    const name = cleanText(body.name, 120);
    const address = cleanText(body.address, 300);
    const store = cleanText(body.store, 120);
    const product = cleanText(body.product, 180);

    if (!/^[0-9a-f-]{36}$/i.test(verificationId)) {
      return sendJson(res, 400, {
        ok: false,
        code: "invalid_verification_id",
        message: "Phiên xác minh Zalo không hợp lệ."
      });
    }

    if (!phone) {
      return sendJson(res, 400, {
        ok: false,
        code: "invalid_phone",
        message: "Số điện thoại chưa đúng định dạng."
      });
    }

    if (!name || !address || !store || !product) {
      return sendJson(res, 400, {
        ok: false,
        code: "missing_fields",
        message: "Vui lòng điền đầy đủ thông tin trước khi nhận lượt quay."
      });
    }

    const row = await selectOne("abraham_phone_verifications", {
      select: "id,expected_phone,verified_phone,status,expires_at,used_at",
      id: "eq." + verificationId,
      limit: "1"
    });

    if (!row) {
      return sendJson(res, 404, {
        ok: false,
        code: "verification_not_found",
        message: "Không tìm thấy phiên xác minh Zalo."
      });
    }

    if (row.used_at) {
      return sendJson(res, 409, {
        ok: false,
        code: "verification_used",
        message: "Phiên xác minh này đã được sử dụng."
      });
    }

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await update(
        "abraham_phone_verifications",
        { id: "eq." + verificationId },
        { status: "expired" }
      );

      return sendJson(res, 410, {
        ok: false,
        code: "verification_expired",
        message: "Phiên xác minh Zalo đã hết hạn. Vui lòng xác minh lại."
      });
    }

    if (
      row.status !== "verified" ||
      row.expected_phone !== phone ||
      row.verified_phone !== phone
    ) {
      return sendJson(res, 403, {
        ok: false,
        code: "phone_not_verified",
        message: "Số điện thoại chưa được Zalo xác minh."
      });
    }

    let rows;
    try {
      rows = await rpc("abraham_submit_lead", {
        p_fullname: name,
        p_phone: phone,
        p_address: address,
        p_store: store,
        p_product: product
      });
    } catch (error) {
      return sendJson(res, error.status || 400, {
        ok: false,
        code: error.code || "submit_failed",
        message: error.message || "Không gửi được thông tin."
      });
    }

    const ticketCode = rows && rows[0] && rows[0].ticket_code;
    if (!ticketCode) {
      return sendJson(res, 500, {
        ok: false,
        code: "missing_ticket_code",
        message: "Không nhận được mã lượt quay."
      });
    }

    await update(
      "abraham_phone_verifications",
      { id: "eq." + verificationId },
      { used_at: new Date().toISOString(), form_data: {} }
    );

    // Đồng bộ cờ phone_verified trong bảng lead nếu bảng hiện tại có cột này.
    // Không làm hỏng luồng quay nếu schema cũ chưa có cột.
    try {
      await update(
        "abraham_leads",
        { phone: "eq." + phone },
        { phone_verified: true }
      );
    } catch (syncError) {
      console.warn("[SubmitVerifiedLead] Không cập nhật phone_verified:", syncError.code || syncError.message);
    }

    return sendJson(res, 200, {
      ok: true,
      ticket_code: ticketCode
    });
  } catch (error) {
    console.error("[SubmitVerifiedLead]", error.code || error.message);
    return sendJson(res, error.status || 500, {
      ok: false,
      code: error.code || "server_error",
      message: error.message || "Lỗi máy chủ khi gửi thông tin."
    });
  }
};
