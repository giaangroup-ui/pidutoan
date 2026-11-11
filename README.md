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
