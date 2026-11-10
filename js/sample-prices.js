/** Dữ liệu mẫu — KHÔNG phải đơn giá chính thức / công bố Sở Xây dựng. */
(function (root) {
  const SAMPLE_NOTE =
    "DỮ LIỆU MẪU — thay bằng đơn giá thực tế (công bố Sở Xây dựng / UBND tỉnh hoặc bảng giá văn phòng). Không phải đơn giá chính thức.";

  root.PIDUTOAN_SAMPLE_PRICES = [
    { maHieu: "PD.TU.110", tenCongTac: "Phá dỡ vách xây (dày khoảng 110 mm)", donVi: "m²", dgVL: 15000, dgNC: 85000, dgMay: 20000, nhom: "Phá dỡ" },
    { maHieu: "PD.TU.200", tenCongTac: "Phá dỡ tường xây (dày khoảng 200 mm)", donVi: "m²", dgVL: 18000, dgNC: 110000, dgMay: 28000, nhom: "Phá dỡ" },
    { maHieu: "PD.SAN", tenCongTac: "Tháo dỡ hoàn thiện / họa tiết sàn", donVi: "m²", dgVL: 8000, dgNC: 45000, dgMay: 5000, nhom: "Phá dỡ" },
    { maHieu: "PD.CUA", tenCongTac: "Tháo dỡ cửa đi / cửa sổ (bộ)", donVi: "bộ", dgVL: 20000, dgNC: 150000, dgMay: 30000, nhom: "Phá dỡ" },
    { maHieu: "PD.CT", tenCongTac: "Phá dỡ cầu thang / giếng thang", donVi: "m²", dgVL: 25000, dgNC: 180000, dgMay: 40000, nhom: "Phá dỡ" },
    { maHieu: "XM.TU.110", tenCongTac: "Xây vách mới (dày < 180 mm)", donVi: "m²", dgVL: 220000, dgNC: 160000, dgMay: 25000, nhom: "Xây mới" },
    { maHieu: "XM.TU.200", tenCongTac: "Xây tường mới (dày >= 180 mm)", donVi: "m²", dgVL: 280000, dgNC: 190000, dgMay: 35000, nhom: "Xây mới" },
    { maHieu: "XM.SAN", tenCongTac: "Hoàn thiện sàn xây mới (mẫu)", donVi: "m²", dgVL: 180000, dgNC: 90000, dgMay: 15000, nhom: "Xây mới" },
    { maHieu: "XM.CUA", tenCongTac: "Lắp đặt cửa đi / cửa sổ (bộ, mẫu)", donVi: "bộ", dgVL: 2500000, dgNC: 350000, dgMay: 50000, nhom: "Xây mới" },
  ].map((row) => ({
    ...row,
    isSample: true,
    nguon: SAMPLE_NOTE,
    ngayApDung: "",
  }));

  root.PIDUTOAN_SAMPLE_NOTE = SAMPLE_NOTE;
})(typeof window !== "undefined" ? window : globalThis);
