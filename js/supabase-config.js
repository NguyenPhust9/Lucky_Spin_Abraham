/* ============================================================
   ABRAHAM BIKE - CẤU HÌNH SUPABASE
   File: js/supabase-config.js

   PHẢI nạp TRƯỚC spin-gate.js và wheel.js:

     <script src="js/supabase-config.js"></script>
     <script src="js/spin-gate.js"></script>
     <script src="js/wheel.js"></script>

   ------------------------------------------------------------
   CHỈ ĐƯỢC DÙNG ANON KEY Ở ĐÂY.
   Tuyệt đối không dán service_role key vào file này — bất kỳ ai
   mở View Source cũng đọc được và sẽ toàn quyền với database.
   Anon key an toàn vì 4 bảng đã bị revoke hết quyền; nó chỉ gọi
   được 3 function đã grant.
   ------------------------------------------------------------
============================================================ */
(function () {

    window.ABRAHAM_SUPABASE = {
        url: 'https://prfimgfuebmhculkbewo.supabase.co',
        anonKey: 'sb_publishable_w5GlR_rpcmB-Z1dywNBusw_KZu7lEHv'
    };


    /* --------------------------------------------------------
       Gọi RPC. Trả về Promise.

       Khi database raise exception, PostgREST trả JSON dạng
       { code, message, details, hint }. Ta ném Error có:
         err.code = tên lỗi kỹ thuật  (vd: 'ticket_used')
         err.message = câu tiếng Việt để hiện cho khách
    --------------------------------------------------------- */
    function rpc(fnName, payload) {

        var cfg = window.ABRAHAM_SUPABASE || {};

        if (!cfg.url || !cfg.anonKey || cfg.anonKey.indexOf('DÁN_') === 0) {
            var e = new Error('Chưa cấu hình Supabase');
            e.code = 'missing_config';
            return Promise.reject(e);
        }

        var endpoint =
            cfg.url.replace(/\/+$/, '') + '/rest/v1/rpc/' + fnName;

        return fetch(endpoint, {
            method: 'POST',
            headers: {
                'apikey': cfg.anonKey,
                'Authorization': 'Bearer ' + cfg.anonKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload || {})
        }).then(function (res) {

            return res.text().then(function (raw) {

                var data = null;
                try { data = raw ? JSON.parse(raw) : null; } catch (err) { data = null; }

                if (res.ok) return data;

                var msg = (data && (data.hint || data.message)) ||
                          ('Lỗi kết nối (' + res.status + ')');

                var error = new Error(msg);
                error.code = (data && data.message) || ('http_' + res.status);
                error.status = res.status;
                throw error;
            });
        });
    }


    /* --------------------------------------------------------
       Có cấu hình hợp lệ hay không.
       Dùng để wheel.js quyết định chạy chế độ thật hay demo.
    --------------------------------------------------------- */
    function isConfigured() {
        var cfg = window.ABRAHAM_SUPABASE || {};
        return !!(cfg.url && cfg.anonKey && cfg.anonKey.indexOf('DÁN_') !== 0);
    }


    window.AbrahamAPI = {
        rpc: rpc,
        isConfigured: isConfigured
    };

})();