function normalizeVietnamPhone(input) {
  const digits = String(input || "").replace(/\D/g, "");

  if (/^0\d{9}$/.test(digits)) {
    return digits;
  }

  if (/^84\d{9}$/.test(digits)) {
    return "0" + digits.slice(2);
  }

  return null;
}

function maskPhone(phone) {
  const value = normalizeVietnamPhone(phone);
  if (!value) return "";
  return value.slice(0, 3) + "****" + value.slice(-3);
}

module.exports = { normalizeVietnamPhone, maskPhone };
