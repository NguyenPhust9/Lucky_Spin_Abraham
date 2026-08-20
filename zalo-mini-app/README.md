# Zalo Mini App - Abraham Phone Verify

Mini App này chỉ làm 1 việc: xin quyền số điện thoại bằng `getPhoneNumber()`, gửi token + access token về API Vercel, sau đó mở lại website Abraham Bike.

Project mẫu dùng **Vite 2.x** để tương thích với Device Mode (`zmp start -D`) theo tài liệu Zalo Mini App hiện tại.

## Tạo / liên kết Mini App

1. Tạo Zalo Mini App trong trang quản lý Zalo Mini App và ghi lại **MINI_APP_ID**.
2. Mở Terminal tại thư mục `zalo-mini-app`.
3. Chạy:

```bash
npm install
npm install -g zmp-cli
zmp init
```

Khi `zmp init` hỏi:
- nhập đúng **Zalo Mini App ID**;
- đăng nhập tài khoản quản trị;
- chọn **Using ZMP to deploy only** vì source Vite đã có sẵn.

Sau đó test trên điện thoại bằng:

```bash
zmp start -D
```

Quét QR bằng Zalo và kiểm tra nút **Cho phép & xác minh**.

Khi test xong, deploy Testing/Production bằng Zalo Mini App Extension hoặc ZMP CLI.

## URL website

Mặc định source đang gọi:

```text
https://uu-dai-abraham-delta.vercel.app
```

Nếu đổi domain, tạo `.env` dựa trên `.env.example`:

```env
VITE_ABRAHAM_SITE_URL=https://domain-cua-ban.vn
```

rồi build/deploy lại Mini App.

## Lưu ý

- `ZALO_APP_SECRET` KHÔNG được đặt trong Mini App.
- Mini App chỉ gửi `phoneToken` + `accessToken` về `/api/zalo-phone-verify`.
- Server Vercel mới dùng `ZALO_APP_SECRET` để đổi token thành số điện thoại.
- Trong Zalo Developer/Mini App, cần xin/được duyệt quyền truy cập số điện thoại trước khi mở cho khách thật.
