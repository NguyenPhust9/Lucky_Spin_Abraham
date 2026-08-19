/* ============================================================
   ABRAHAM BIKE - BĂNG CHẠY KHÁCH TRÚNG THƯỞNG
   File: js/ticker.js

   Có dữ liệu thật thì hiện người trúng thật (đã che thông tin).
   Chưa có ai trúng thì hiện danh sách mẫu bên dưới.
   Cần js/supabase-config.js nạp trước.
============================================================ */
(function () {

    var REFRESH_MS = 60000;
    var LIMIT = 12;

    /* Danh sách mẫu, dùng khi chương trình chưa có người trúng */
    var SAMPLE = [
        { masked_name: 'Ngọc ***', masked_phone: '0903***112', prize_label: 'Nón bảo hiểm thể thao' },
        { masked_name: 'Minh ***', masked_phone: '0912***478', prize_label: 'Đèn hậu chớp + chuông' },
        { masked_name: 'Hải ***',  masked_phone: '0987***330', prize_label: 'Bơm A2 + khoá dây 4 số' },
        { masked_name: 'Thu ***',  masked_phone: '0935***091', prize_label: 'Bình nước + đèn phản quang' },
        { masked_name: 'Quốc ***', masked_phone: '0961***725', prize_label: 'Xe đạp không đề 24 inch' }
    ];

    var box = document.getElementById('live-ticker');
    var track = document.querySelector('[data-ticker-track]');

    if (!box || !track) return;

    function esc(v) {
        return String(v == null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function item(w) {
        return '<span>' +
                   '<i class="fa-solid fa-gift text-brand-blue"></i> ' +
                   esc(w.masked_name) + ' · ' +
                   esc(w.masked_phone) + ' · ' +
                   esc(w.prize_label) +
               '</span>';
    }

    function render(rows) {
        if (!rows || !rows.length) rows = SAMPLE;

        var visible = rows.map(item).join('');
        var clone = rows.map(function (w) {
            return item(w).replace('<span>', '<span aria-hidden="true">');
        }).join('');

        track.innerHTML = visible + clone;
        box.style.display = '';
    }

    function load() {
        if (!window.AbrahamAPI || !window.AbrahamAPI.isConfigured()) {
            render(SAMPLE);
            return;
        }

        window.AbrahamAPI.rpc('abraham_recent_winners', { p_limit: LIMIT })
            .then(render)
            .catch(function (err) {
                console.warn('[AbrahamTicker] Không tải được, dùng danh sách mẫu:', err.message);
                render(SAMPLE);
            });
    }

    load();
    window.setInterval(load, REFRESH_MS);

})();