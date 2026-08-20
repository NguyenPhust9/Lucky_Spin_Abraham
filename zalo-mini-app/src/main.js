import {
  getAccessToken,
  getPhoneNumber,
  getRouteParams,
  openWebview
} from "zmp-sdk";
import "./style.css";

const API_BASE = (
  import.meta.env.VITE_ABRAHAM_SITE_URL ||
  "https://uu-dai-abraham-delta.vercel.app"
).replace(/\/+$/, "");

const routeParams = getRouteParams() || {};
const verificationId = String(routeParams.verification || "").trim();

let status = "idle";
let message = "";
let returnUrl = "";

const app = document.getElementById("app");

function explainError(error) {
  const code = error && (error.code ?? error.error);

  if (code === -201 || code === -202 || code === -2002) {
    return "Bạn chưa đồng ý chia sẻ số điện thoại. Hãy bấm thử lại và chọn Cho phép.";
  }

  return (
    (error && (error.message || error.error_description)) ||
    "Không xác minh được số điện thoại. Vui lòng thử lại."
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function render() {
  const showStatus = status !== "idle";
  const isLoading = status === "loading";
  const isSuccess = status === "success";

  app.innerHTML = `
    <main class="page">
      <section class="card">
        <div class="logo">ABRAHAM <span>BIKE</span></div>
        <div class="shield">✓</div>
        <h1>Xác minh số điện thoại</h1>
        <p class="intro">
          Abraham Bike cần xác minh số điện thoại để đảm bảo mỗi khách hàng chỉ
          nhận một lượt quay và có thể liên hệ giao quà khi trúng thưởng.
        </p>

        <div class="privacy">
          Zalo chỉ chia sẻ số điện thoại khi bạn bấm cho phép. Không cần nhận SMS OTP.
        </div>

        ${showStatus ? `<div class="status ${escapeHtml(status)}">${escapeHtml(message)}</div>` : ""}

        ${
          !isSuccess
            ? `<button id="verify-btn" class="primary" ${isLoading ? "disabled" : ""}>
                 ${isLoading ? "Đang xác minh..." : "Cho phép & xác minh"}
               </button>`
            : `<button id="back-btn" class="primary" ${returnUrl ? "" : "disabled"}>
                 Quay lại website Abraham Bike
               </button>`
        }

        <p class="small">
          Nếu số trên Zalo không trùng với số đã nhập ở website, hệ thống sẽ không
          mở lượt quay.
        </p>
      </section>
    </main>
  `;

  const verifyBtn = document.getElementById("verify-btn");
  if (verifyBtn) verifyBtn.addEventListener("click", verifyPhone);

  const backBtn = document.getElementById("back-btn");
  if (backBtn) backBtn.addEventListener("click", backToWebsite);
}

async function verifyPhone() {
  if (!verificationId) {
    status = "error";
    message = "Thiếu mã phiên xác minh. Vui lòng mở lại từ website Abraham Bike.";
    render();
    return;
  }

  status = "loading";
  message = "Zalo đang yêu cầu quyền chia sẻ số điện thoại...";
  render();

  try {
    // Zalo chỉ trả token số điện thoại. Việc đổi token -> số thật phải chạy ở server.
    const phoneResult = await getPhoneNumber();
    const accessToken = await getAccessToken();

    if (!phoneResult || !phoneResult.token || !accessToken) {
      throw new Error("Zalo không trả về đủ dữ liệu xác minh.");
    }

    message = "Đang đối chiếu số điện thoại với website Abraham Bike...";
    render();

    const response = await fetch(API_BASE + "/api/zalo-phone-verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        verificationId,
        phoneToken: phoneResult.token,
        accessToken
      })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok || !data.verified) {
      const err = new Error(data.message || "Xác minh không thành công.");
      err.code = data.code;
      throw err;
    }

    status = "success";
    message = "Xác minh thành công" + (data.phone ? " cho số " + data.phone : "") + ".";
    returnUrl = data.returnUrl || "";
    render();

    if (returnUrl) {
      window.setTimeout(() => {
        openWebview({
          url: returnUrl,
          config: { style: "normal" }
        }).catch(() => {
          // Nút quay lại website vẫn hiển thị làm phương án dự phòng.
        });
      }, 650);
    }
  } catch (error) {
    console.error("[Abraham Zalo Verify]", error);
    status = "error";
    message = explainError(error);
    render();
  }
}

async function backToWebsite() {
  if (!returnUrl) return;

  try {
    await openWebview({
      url: returnUrl,
      config: { style: "normal" }
    });
  } catch (error) {
    status = "error";
    message = "Không mở lại được website. Vui lòng quay lại trình duyệt và bấm Quay ngay.";
    render();
  }
}

render();
