# PiDự toán

Ứng dụng web hỗ trợ kiến trúc sư **bóc khối lượng** và **lập dự toán** xây dựng.

- Địa chỉ dùng thử: https://giaangroup-ui.github.io/pidutoan/
- Mã nguồn: https://github.com/giaangroup-ui/pidutoan

## MVP này làm được gì

1. Quản lý công trình (tên, địa điểm, chủ đầu tư) — dữ liệu lưu trên trình duyệt (`localStorage`), có xuất/nhập JSON.
2. Nhập khối lượng:
   - Tải DXF: cộng chiều dài LINE/LWPOLYLINE (m), diện tích polyline kín và hatch (m²), đếm block INSERT theo tên. Chọn đơn vị bản vẽ (mặc định mm) rồi gán layer/block vào công tác.
   - Nhập Excel/CSV bảng khối lượng PiCAD (cột Mã, Nội dung, Vị trí, Kích thước, ĐV, KL, Ghi chú).
   - Thêm dòng thủ công.
   - **Tải PDF / Ảnh** (.pdf, .jpg, .png, .webp): lưu làm tài liệu tham chiếu của công trình (IndexedDB, trên máy này).
     - PDF có lớp chữ: đọc bảng KL (Nội dung / ĐV / KL) → xem trước, bỏ chọn dòng sai rồi mới thêm. Không tự điền số.
     - PDF scan (không có lớp chữ): báo «PDF scan, cần đo trên bản vẽ».
     - Trình đo trên màn hình: hiệu chỉnh tỷ lệ bằng 2 điểm + chiều dài thực (mm), đo dài (m), diện tích (m²), đếm (cái); thu phóng, kéo, chạm 2 ngón; hoàn tác, xóa. Mỗi phép đo thành một dòng KL, Nguồn = tên file · trang.
3. Thư viện đơn giá do người dùng tự nhập hoặc tải CSV/Excel. Bộ **dữ liệu mẫu** chỉ để thử giao diện — **không phải đơn giá chính thức**.
4. Bảng dự toán: khối lượng × đơn giá → thành tiền, cộng theo hạng mục/tầng, cộng chi phí chung, TNCTT, VAT, dự phòng (tỷ lệ do người dùng nhập).
5. Xuất Excel (có công thức) và in PDF qua hộp thoại in của trình duyệt.

## Không thay thế thẩm duyệt

App chỉ hỗ trợ soạn và tính toán. Kiến trúc sư và chủ đầu tư chịu trách nhiệm về hồ sơ. App không thay thẩm định, thẩm duyệt hay cam kết pháp lý.

Căn cứ pháp lý cần theo dõi khi lập dự toán (đã đối chiếu ngày ban hành / hiệu lực trên Cổng TTĐT Chính phủ trong kế hoạch ngày 10/11/2026, giờ Asia/Saigon):

- Luật Xây dựng 135/2025/QH15 (hiệu lực 01/7/2026)
- Nghị định 206/2026/NĐ-CP (ban hành 15/6/2026, hiệu lực 01/7/2026) — quản lý chi phí đầu tư xây dựng
- Thông tư 38/2026/TT-BXD (ban hành 26/6/2026, hiệu lực 01/7/2026) — định mức xây dựng

Tỷ lệ chi phí chung, thu nhập chịu thuế tính trước, VAT và dự phòng **do người dùng tự nhập** theo quy định và hướng dẫn hiện hành. App không gắn cứng định mức.

Đơn giá vật liệu, nhân công, ca máy theo công bố của địa phương / bảng giá người dùng có. App không phát hành một bảng giá quốc gia.

## Chạy local

Mở `index.html` qua một HTTP server (không mở `file://` nếu muốn CDN tải ổn định):

```bash
python3 -m http.server 8080
```

Rồi vào http://localhost:8080/

## Kiểm tra parse file PiCAD

```bash
npm install dxf-parser xlsx
node tests/parse-picad.mjs
```

## Kiểm thử PDF / ảnh (headless Chrome)

```bash
python3 tests/make_fixtures.py     # tạo PDF bảng + mặt bằng 1:100, PDF scan, PNG
python3 tests/media_e2e.py         # hoặc: python3 tests/media_e2e.py https://giaangroup-ui.github.io/pidutoan/
```

## Quy trình 9 bước & kiểm tra chéo (kỷ luật kiến trúc)

- **Quy trình** (tab «Quy trình»): 1 Thông tin công trình → 2 Nhận & kiểm tra hồ sơ (DXF/BKL, checklist bộ môn, layer chưa chuẩn, block chưa mã) → 3 Danh mục công việc (loại công tác, bộ môn, tầng) → 4 Đo bóc có diễn giải (H tầng, KL bóc DXF, ô KL lỗi) → 5 Kiểm tra chéo → 6 Áp mã đơn giá → 7 Tổng hợp chi phí (cấu trúc TT 36/2026 Bảng 3.8, tỷ lệ người dùng xác nhận) → 8 Kiểm giá → 9 Báo cáo & duyệt. Bước sau bị khóa khi bước trước còn thiếu.
- **Kiểm tra** (tab «Kiểm tra»): ΣL tường theo nhóm/tầng, từng tag (đi theo leader), có mặt hai phía, cửa (PD ↔ TK_CUA), đầu tường hở, trùng dòng (QĐ 1041 Mục I.4), KL 0/âm, KL ≠ L×H, đơn vị, lỗi công thức Excel, tỷ lệ (khoảng **dữ liệu mẫu**). Ngưỡng xanh ≤2%, vàng 2–5%, đỏ >5% — sửa được. Xuất Excel / In PDF, có «Người kiểm tra / ngày duyệt».
- **Chuẩn layer**: hồ sơ layer/block sửa được, nhập/xuất JSON.
- Quy tắc trừ chi tiết từng công tác: **cần xác minh / người dùng tự cấu hình** (QĐ 1041/QĐ-BXD chỉ nêu nguyên tắc chung).

Kiểm thử: `node tests/arch-check.cjs` (DXF + BKL v3.7 và BKL sửa: 1 dòng +10%, 1 dòng xóa → cả hai đỏ) · `python3 tests/flow_e2e.py [url]` (giao diện, chặn bước, xuất BKL, PWA).

## Cài app (PWA)

`manifest.webmanifest`, icon 192/512 + maskable, `apple-touch-icon`, service worker `sw.js?v=<phiên bản>` (cache `pidutoan-<phiên bản>`, network-first cho html/js/css, xóa cache cũ khi kích hoạt). Nút «Cài app» dùng `beforeinstallprompt`; iPhone/iPad: Safari → Chia sẻ → Thêm vào MH chính.
Trước mỗi lần phát hành: `python3 tools/set-version.py` (đổi `?v=` trong index.html và `version.json`).
