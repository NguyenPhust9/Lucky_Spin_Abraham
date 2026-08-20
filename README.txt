ABRAHAM BIKE - XÁC MINH SỐ ĐIỆN THOẠI BẰNG ZALO MINI APP
==========================================================

Bản này đã thay luồng Firebase SMS OTP bằng:

WEBSITE -> ZALO MINI APP -> chia sẻ SĐT -> SERVER đối chiếu -> WEBSITE -> QUAY THƯỞNG

Website chính vẫn là:
https://uu-dai-abraham-delta.vercel.app

Mini App chỉ là bước xác minh trung gian.

----------------------------------------------------------
1. CHẠY SQL TRÊN SUPABASE
----------------------------------------------------------

Mở:
Supabase > SQL Editor

Chạy file:
sql/01_zalo_phone_verification.sql

File này tạo bảng:
public.abraham_phone_verifications

Bảng bật RLS và không mở quyền cho anon/authenticated.
Chỉ API Vercel dùng Service Role mới đọc/ghi được.

SQL cũng thu hồi quyền anon/authenticated gọi trực tiếp
RPC abraham_submit_lead và chỉ cho service_role gọi.
Việc này rất quan trọng: nếu không, người dùng có thể mở DevTools
và bỏ qua bước xác minh Zalo bằng cách gọi RPC trực tiếp.

----------------------------------------------------------
2. THÊM ENVIRONMENT VARIABLES TRÊN VERCEL
----------------------------------------------------------

Project Vercel > Settings > Environment Variables

Bắt buộc:

ZALO_MINI_APP_ID=<MINI APP ID của bạn>
ZALO_APP_SECRET=<Secret Key của Zalo App cha>
SUPABASE_SERVICE_ROLE_KEY=<service_role key của Supabase>
ABRAHAM_SITE_URL=https://uu-dai-abraham-delta.vercel.app

Khuyến nghị thêm:

SUPABASE_URL=https://prfimgfuebmhculkbewo.supabase.co

LƯU Ý RẤT QUAN TRỌNG:
- ZALO_MINI_APP_ID và ZALO_APP_ID là 2 ID khác nhau.
- ZALO_APP_SECRET KHÔNG được đưa vào index.html / JS frontend / Mini App source public.
- SUPABASE_SERVICE_ROLE_KEY KHÔNG được đưa vào frontend.

Bản này KHÔNG còn cần:
ZALO_REDIRECT_URI
cho luồng xác minh SĐT.

----------------------------------------------------------
3. TẠO MINI APP XÁC MINH
----------------------------------------------------------

Source mẫu nằm tại:
zalo-mini-app/

Mở Terminal tại thư mục đó:

npm install
npm install -g zmp-cli
zmp init

Khi được hỏi:
- nhập đúng Zalo Mini App ID;
- đăng nhập tài khoản quản trị;
- chọn "Using ZMP to deploy only".

Test trên điện thoại:

zmp start -D

Sau đó dùng Zalo quét QR.

Chi tiết xem:
zalo-mini-app/README.md

----------------------------------------------------------
4. DEPLOY WEBSITE LÊN VERCEL
----------------------------------------------------------

Sau khi chạy SQL + thêm ENV:

git add .
git commit -m "Tich hop Zalo Mini App xac minh so dien thoai"
git push

Hoặc deploy lại trực tiếp từ Vercel.

----------------------------------------------------------
5. LUỒNG HOẠT ĐỘNG
----------------------------------------------------------

A. Khách bấm QUAY NGAY.
B. Form hiện ra và khách nhập SĐT.
C. Khách bấm "Xác minh bằng Zalo".
D. Website gọi:
   POST /api/zalo-verify-start
E. Server tạo verificationId và điều hướng tới:
   https://zalo.me/s/{MINI_APP_ID}/?verification={verificationId}
F. Mini App giải thích mục đích và khách bấm "Cho phép & xác minh".
G. Mini App gọi getPhoneNumber() + getAccessToken().
H. Mini App gửi token về:
   POST /api/zalo-phone-verify
I. Vercel dùng ZALO_APP_SECRET gọi Zalo Open API để lấy SĐT thật.
J. Server so sánh SĐT Zalo với SĐT khách đã nhập.
K. Nếu khớp: status = verified.
L. Mini App mở lại website với verificationId.
M. Website hỏi server:
   GET /api/zalo-verify-status?id=...
N. Chỉ khi server trả verified=true, form mới được phép gửi.
O. Form gọi:
   POST /api/submit-verified-lead
P. Server kiểm tra lại verification server-side, sau đó mới gọi RPC:
   abraham_submit_lead
Q. RPC này đã bị khóa khỏi anon/authenticated; chỉ Service Role gọi được.
R. Nhận ticket_code và wheel.js quay như cũ.

----------------------------------------------------------
6. FILE MỚI / FILE ĐÃ SỬA
----------------------------------------------------------

Đã sửa:
js/spin-gate.js

API mới:
api/zalo-verify-start.js
api/zalo-verify-status.js
api/zalo-phone-verify.js
api/submit-verified-lead.js

Server helpers:
lib/http.js
lib/phone.js
lib/supabase-server.js

SQL:
sql/01_zalo_phone_verification.sql

Mini App:
zalo-mini-app/

Firebase OTP đã được bỏ khỏi luồng.
File Zalo OAuth Login cũ được giữ trong:
legacy-zalo-login/
nhưng KHÔNG còn được website sử dụng để xác minh SĐT.

----------------------------------------------------------
7. CÁCH TEST NHANH
----------------------------------------------------------

Sau khi deploy Vercel:

1) Mở website trên điện thoại.
2) Bấm QUAY NGAY.
3) Nhập một SĐT hợp lệ của chính tài khoản Zalo đang test.
4) Bấm Xác minh bằng Zalo.
5) Zalo phải mở Mini App.
6) Bấm Cho phép & xác minh.
7) Nếu đúng số, Mini App báo thành công và mở lại website.
8) Bấm QUAY NGAY.
9) Form phải hiện:
   "Số điện thoại đã được Zalo xác minh"
10) Gửi form và quay.

Nếu Zalo báo số không trùng:
- quay lại web;
- sửa SĐT cho đúng với số của tài khoản Zalo;
- xác minh lại.

----------------------------------------------------------
8. LOCAL DEVELOPMENT
----------------------------------------------------------

`npm run serve` chỉ chạy static web nên KHÔNG chạy được thư mục /api.

Để test full API local, nên dùng Vercel CLI:

npx vercel dev

Nhớ cấu hình ENV local tương ứng.
