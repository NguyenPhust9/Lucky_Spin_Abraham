ABRAHAM BIKE - ZALO LOGIN

1. Copy 3 file/folder này vào project:

api/zalo-login.js
api/zalo-callback.js
api/zalo-session.js
zalo-callback.html

2. Vercel Environment Variables phải có:
ZALO_APP_ID
ZALO_APP_SECRET
ZALO_REDIRECT_URI=https://uu-dai-abraham-delta.vercel.app/zalo-callback.html

3. Zalo Developers > Đăng nhập bằng Zalo:
Home URL:
https://uu-dai-abraham-delta.vercel.app/

Callback URL:
https://uu-dai-abraham-delta.vercel.app/zalo-callback.html

4. Git:
git add .
git commit -m "Them dang nhap Zalo"
git push

5. Sau khi Vercel deploy xong, mở:
https://uu-dai-abraham-delta.vercel.app/api/zalo-login

Nếu thành công, Zalo sẽ xin đăng nhập/cấp quyền rồi trả về website.

6. Kiểm tra session:
https://uu-dai-abraham-delta.vercel.app/api/zalo-session

Khi đã đăng nhập sẽ trả:
{
  "ok": true,
  "loggedIn": true,
  "user": {
    "id": "...",
    "name": "...",
    "picture": "..."
  }
}

LƯU Ý:
- Không đưa ZALO_APP_SECRET vào frontend/GitHub.
- Bộ này mới kiểm tra Zalo Login.
- Sau khi test login thành công mới nối user.id vào Supabase và spin-gate.
