import { initializeApp } from
  "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

import {
  getAuth,
  RecaptchaVerifier,
  signInWithPhoneNumber
} from
  "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";


const firebaseConfig = {
  apiKey: "AIzaSyBtmw3y63Y2nEohJtjFudn8g2YDuauyJ8I",
  authDomain: "abraham-8bda9.firebaseapp.com",
  projectId: "abraham-8bda9",
  storageBucket: "abraham-8bda9.firebasestorage.app",
  messagingSenderId: "639192313351",
  appId: "1:639192313351:web:a6d02b245949a2589c44a2"
};


const app = initializeApp(firebaseConfig);

const auth = getAuth(app);

auth.languageCode = "vi";


// ================================
// FORMAT SỐ ĐIỆN THOẠI VIỆT NAM
// 0901234567 → +84901234567
// ================================

function formatVietnamPhone(phone) {

    phone = phone.trim().replace(/\D/g, "");

    if (phone.startsWith("0")) {
        return "+84" + phone.substring(1);
    }

    if (phone.startsWith("84")) {
        return "+" + phone;
    }

    if (phone.startsWith("+84")) {
        return phone;
    }

    return phone;
}


// ================================
// RECAPTCHA
// ================================

function initRecaptcha() {

    if (window.recaptchaVerifier) {
        return;
    }

    window.recaptchaVerifier = new RecaptchaVerifier(
        auth,
        "recaptcha-container",
        {
            size: "invisible"
        }
    );

}


// ================================
// GỬI OTP
// ================================

window.sendFirebaseOTP = async function () {

    const phoneInput =
        document.getElementById("otp-phone");

    if (!phoneInput) {
        console.error("Không tìm thấy #otp-phone");
        return;
    }

    const phone =
        formatVietnamPhone(phoneInput.value);

    if (!phone) {
        alert("Vui lòng nhập số điện thoại.");
        return;
    }

    try {

        initRecaptcha();

        window.confirmationResult =
            await signInWithPhoneNumber(
                auth,
                phone,
                window.recaptchaVerifier
            );

        console.log("OTP đã được gửi:", phone);

        document
            .getElementById("otp-code-area")
            ?.classList.remove("hidden");

        alert("Mã OTP đã được gửi.");

    } catch (error) {

        console.error(
            "Firebase send OTP error:",
            error
        );

        // reset captcha nếu gửi lỗi
        if (window.recaptchaVerifier) {
            window.recaptchaVerifier.clear();
            window.recaptchaVerifier = null;
        }

        alert(
            "Không thể gửi OTP: " +
            error.message
        );
    }
};


// ================================
// XÁC MINH OTP
// ================================

window.verifyFirebaseOTP = async function () {

    const otp =
        document
            .getElementById("otp-code")
            ?.value
            .trim();

    if (!otp) {
        alert("Vui lòng nhập mã OTP.");
        return;
    }

    if (!window.confirmationResult) {
        alert("Vui lòng gửi OTP trước.");
        return;
    }

    try {

        const result =
            await window.confirmationResult.confirm(otp);

        const user = result.user;

        console.log(
            "OTP VERIFIED:",
            user.phoneNumber
        );

        // CHỈ DÙNG CHO GIAI ĐOẠN TEST
        window.abrahamPhoneVerified = true;

        window.abrahamVerifiedPhone =
            user.phoneNumber;

        alert("Xác minh số điện thoại thành công!");

        document.dispatchEvent(
            new CustomEvent(
                "abraham:phone-verified",
                {
                    detail: {
                        phone: user.phoneNumber,
                        user: user
                    }
                }
            )
        );

    } catch (error) {

        console.error(
            "Firebase verify OTP error:",
            error
        );

        alert("Mã OTP không đúng hoặc đã hết hạn.");
    }

};