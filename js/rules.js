/* Quy trình & quy tắc đo bóc — dữ liệu có trích nguồn. Không tự đặt ngưỡng pháp lý.
 * Chỗ nào văn bản hiện hành không quy định chi tiết: đánh dấu "cần xác minh / người dùng tự cấu hình". */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiRules = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const VERIFY = "cần xác minh / người dùng tự cấu hình";

  const SOURCES = {
    QD1041: {
      id: "QD1041", short: "QĐ 1041/QĐ-BXD",
      title: "Quyết định 1041/QĐ-BXD ngày 26/6/2026 công bố Hướng dẫn xác định khối lượng công trình (áp dụng từ 01/7/2026; Điều 3: để tham khảo)",
      url: "https://thuvienphapluat.vn/van-ban/Xay-dung-Do-thi/Quyet-dinh-1041-QD-BXD-2026-cong-bo-Huong-dan-xac-dinh-khoi-luong-cong-trinh-712454.aspx",
      urlAlt: "https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/chinh-sach-moi/116105/toan-bo-huong-dan-xac-dinh-khoi-luong-cong-trinh-theo-quyet-dinh-1041-qd-bxd",
    },
    TT37: {
      id: "TT37", short: "TT 37/2026/TT-BXD",
      title: "Thông tư 37/2026/TT-BXD ngày 26/6/2026 hướng dẫn phương pháp xác định định mức dự toán và các chỉ tiêu kinh tế kỹ thuật (hiệu lực 01/7/2026; thay thế TT 13/2021/TT-BXD)",
      url: "https://vanban.chinhphu.vn/?docid=218630&pageid=27160",
    },
    TT38: {
      id: "TT38", short: "TT 38/2026/TT-BXD",
      title: "Thông tư 38/2026/TT-BXD ngày 26/6/2026 ban hành định mức xây dựng (hiệu lực 01/7/2026) — chỉ là định mức, không phải quy tắc đo bóc",
      url: "https://chinhphu.vn/?docid=218632&pageid=27160",
    },
    TT36: {
      id: "TT36", short: "TT 36/2026/TT-BXD",
      title: "Thông tư 36/2026/TT-BXD ngày 26/6/2026 hướng dẫn một số nội dung, phương pháp xác định và quản lý chi phí đầu tư xây dựng (hiệu lực 01/7/2026) — Phụ lục III: phương pháp xác định chi phí xây dựng",
      url: "https://vanban.chinhphu.vn/?docid=218629&pageid=27160",
      urlAlt: "https://cdn.thuvienphapluat.vn/uploads/Hoidapphapluat/2026/DTT/19082026/pl3-tt36.pdf",
    },
    ND206: {
      id: "ND206", short: "NĐ 206/2026/NĐ-CP",
      title: "Nghị định 206/2026/NĐ-CP hướng dẫn quản lý chi phí đầu tư xây dựng — Điều 12: nội dung dự toán xây dựng",
      url: "https://thuvienphapluat.vn/van-ban/Xay-dung-Do-thi/Nghi-dinh-206-2026-ND-CP-huong-dan-quan-ly-chi-phi-dau-tu-xay-dung-457659.aspx",
    },
    TT13_OLD: {
      id: "TT13_OLD", short: "TT 13/2021/TT-BXD (hết hiệu lực)",
      title: "Thông tư 13/2021/TT-BXD — Phụ lục VI phương pháp đo bóc khối lượng (đã bị TT 37/2026/TT-BXD thay thế từ 01/7/2026; chỉ để tham khảo lịch sử, app không trích ngưỡng từ văn bản này)",
      url: "https://truongtao.com.vn/thong-tu-37-2026-thay-thong-tu-13-2021/",
    },
  };

  /** QĐ 1041/QĐ-BXD, Mục I — Nguyên tắc xác định khối lượng (trích nguyên văn rút gọn). */
  const PRINCIPLES = [
    { id: "I.1", text: "Khối lượng được xác định phù hợp mức độ chi tiết của hồ sơ dự án, hồ sơ thiết kế và yêu cầu xác định chi phí từng giai đoạn; căn cứ gồm hồ sơ thiết kế, chỉ dẫn kỹ thuật, tiêu chuẩn, quy chuẩn, BIM, dữ liệu phần mềm, công cụ số…" },
    { id: "I.2", text: "Loại khối lượng, mức độ chi tiết và đơn vị tính phải phù hợp loại thiết kế, giai đoạn và yêu cầu xác định chi phí." },
    { id: "I.3", text: "Việc xác định khối lượng phải tương ứng với loại giá xây dựng theo phương pháp xác định chi phí dự kiến áp dụng." },
    { id: "I.4", text: "Mỗi khối lượng chỉ được xác định một lần; chỗ giao thoa giữa các bộ phận / hệ thống / phạm vi phải xác định rõ phạm vi tính để tránh trùng lặp." },
    { id: "I.5", text: "Đơn vị tính khối lượng phải tương ứng với đơn vị dùng trong suất vốn đầu tư, suất chi phí, giá nhóm công tác, giá bộ phận kết cấu, giá xây dựng khác…" },
    { id: "I.6", text: "Kết quả phải thể hiện rõ loại khối lượng, căn cứ, nguồn dữ liệu và phương pháp xác định để phục vụ kiểm tra, rà soát." },
  ];

  const NOTE_NO_DETAIL = "QĐ 1041/QĐ-BXD chỉ quy định nguyên tắc (Mục I) và loại khối lượng (Mục III), không có quy tắc đo chi tiết cho từng công tác. Quy tắc cũ ở TT 13/2021/TT-BXD Phụ lục VI đã bị TT 37/2026/TT-BXD thay thế. Công thức dưới đây là hình học; các quy tắc trừ/không trừ: " + VERIFY + ".";

  function d(label) { return { label, value: "", status: VERIFY }; }

  /** Loại công tác — "order" là trình tự thi công thông thường (gợi ý, người dùng sửa được), không phải quy định. */
  const WORK_TYPES = [
    { key: "pha_do", label: "Phá dỡ, tháo dỡ", order: 10, boMon: "Kiến trúc", units: ["m²", "m³", "bộ", "cái", "m"],
      formula: "Tường/vách: S = L × H (m²) hoặc V = L × t × H (m³); sàn: S = diện tích; cửa: đếm bộ",
      deductions: [d("Trừ lỗ cửa khi tính phá dỡ tường"), d("Đơn vị tính theo loại giá áp dụng (m² hay m³)")],
      kw: /phá dỡ|pha do|tháo dỡ|thao do|đập bỏ|dap bo|cắt tường|đục/i },
    { key: "dao_dat", label: "Đào đất", order: 20, boMon: "Kết cấu", units: ["m³"],
      formula: "V = Σ (dài × rộng × sâu) theo kích thước hố đào thiết kế",
      deductions: [d("Mở rộng đáy / mái dốc hố đào"), d("Hệ số nở rời / đầm chặt")],
      kw: /đào|dao dat|đào móng/i },
    { key: "dap_dat", label: "Đắp đất, cát", order: 25, boMon: "Kết cấu", units: ["m³"],
      formula: "V đắp = V hố đào − V kết cấu chiếm chỗ (theo thiết kế)",
      deductions: [d("Hệ số đầm chặt K")], kw: /đắp|dap dat|lấp|tôn nền/i },
    { key: "bt_mong", label: "Bê tông móng", order: 30, boMon: "Kết cấu", units: ["m³"], element: "móng",
      formula: "V = Σ (dài × rộng × cao) từng khối móng / giằng móng",
      deductions: [d("Trừ thể tích cốt thép, chi tiết chôn sẵn"), d("Phạm vi giao móng – cột – giằng (tránh trùng, QĐ 1041 I.4)")],
      kw: /bê tông.*móng|be tong.*mong|bt móng|giằng móng/i },
    { key: "bt_cot", label: "Bê tông cột", order: 40, boMon: "Kết cấu", units: ["m³"], element: "cột",
      formula: "V = tiết diện × chiều cao cột (theo quy ước giao cột – dầm – sàn)",
      deductions: [d("Chiều cao cột tính đến mặt dưới dầm / sàn")], kw: /bê tông.*cột|be tong.*cot|bt cột/i },
    { key: "bt_dam", label: "Bê tông dầm", order: 41, boMon: "Kết cấu", units: ["m³"], element: "dầm",
      formula: "V = b × h × L thông thủy giữa các gối",
      deductions: [d("Phần dầm giao sàn tính vào dầm hay sàn")], kw: /bê tông.*dầm|be tong.*dam|bt dầm/i },
    { key: "bt_san", label: "Bê tông sàn", order: 42, boMon: "Kết cấu", units: ["m³"], element: "sàn",
      formula: "V = diện tích sàn × chiều dày",
      deductions: [d("Trừ lỗ mở sàn (ngưỡng diện tích)")], kw: /bê tông.*sàn|be tong.*san|bt sàn|mái/i },
    { key: "bt_thang", label: "Bê tông cầu thang", order: 43, boMon: "Kết cấu", units: ["m³"], element: "cầu thang",
      formula: "V = bản thang + bậc + chiếu nghỉ (theo kích thước thiết kế)",
      deductions: [d("Cách tính bậc xây trên bản")], kw: /cầu thang|cau thang/i },
    { key: "van_khuon", label: "Ván khuôn", order: 44, boMon: "Kết cấu", units: ["m²", "100m²"],
      formula: "S = diện tích mặt bê tông tiếp xúc ván khuôn theo từng cấu kiện (móng, cột, dầm, sàn, cầu thang)",
      deductions: [d("Trừ diện tích chỗ giao cấu kiện"), d("Đơn vị m² hay 100 m² theo định mức áp dụng")],
      kw: /ván khuôn|van khuon|cốp pha|cop pha/i },
    { key: "cot_thep", label: "Cốt thép (theo đường kính)", order: 45, boMon: "Kết cấu", units: ["kg", "tấn"],
      formula: "G = Σ (chiều dài thanh × số thanh × khối lượng 1 m); khối lượng 1 m = π·d²/4 × ρ thép (ρ người dùng xác nhận)",
      deductions: [d("Nhóm đường kính (≤10, ≤18, >18 mm…) theo định mức áp dụng"), d("Chiều dài nối, neo, móc uốn")],
      kw: /cốt thép|cot thep|thép tròn|thép (d|ø|phi)\s*\d/i },
    { key: "xay", label: "Xây tường (theo chiều dày)", order: 50, boMon: "Kiến trúc", units: ["m³", "m²"],
      formula: "V = (L × H − Σ S lỗ cửa) × t − V bê tông chìm (lanh tô, giằng, cột trong tường)",
      deductions: [d("Ngưỡng diện tích lỗ cửa được trừ"), d("Trừ bê tông chìm trong tường"), d("Phân nhóm chiều dày / chiều cao")],
      kw: /xây|xay moi|tường xây|vách xây/i },
    { key: "trat", label: "Trát", order: 60, boMon: "Kiến trúc", units: ["m²"],
      formula: "S = diện tích mặt trát (từng mặt) − lỗ cửa + má cửa (nếu cấu hình)",
      deductions: [d("Ngưỡng lỗ cửa được trừ"), d("Tính má cửa, gờ chỉ")], kw: /trát|trat/i },
    { key: "chong_tham", label: "Chống thấm", order: 62, boMon: "Kiến trúc", units: ["m²"],
      formula: "S = diện tích sàn chống thấm + phần vén chân tường (chiều cao vén theo thiết kế)",
      deductions: [d("Chiều cao vén chân tường")], kw: /chống thấm|chong tham/i },
    { key: "op_lat", label: "Ốp, lát", order: 70, boMon: "Kiến trúc", units: ["m²"],
      formula: "S = diện tích bề mặt ốp / lát thực tế theo thiết kế",
      deductions: [d("Trừ lỗ, chân cột, thiết bị chiếm chỗ")], kw: /ốp|lát|op lat|gạch lát|len chân/i },
    { key: "tran", label: "Trần", order: 75, boMon: "Kiến trúc", units: ["m²"],
      formula: "S = diện tích trần theo mặt bằng (+ phần giật cấp nếu có)",
      deductions: [d("Trừ lỗ kỹ thuật"), d("Cách tính giật cấp")], kw: /trần|tran thach cao|trần thạch cao/i },
    { key: "son", label: "Sơn, bả", order: 80, boMon: "Kiến trúc", units: ["m²"],
      formula: "S = diện tích bề mặt sơn (từng mặt) − lỗ cửa",
      deductions: [d("Ngưỡng lỗ cửa được trừ")], kw: /sơn|son nuoc|bả|matit/i },
    { key: "cua", label: "Cửa đi, cửa sổ", order: 85, boMon: "Kiến trúc", units: ["bộ", "m²", "cái"],
      formula: "Đếm bộ theo mã loại; hoặc S = rộng × cao theo loại giá áp dụng",
      deductions: [d("Đơn vị bộ hay m²")], kw: /cửa|cua di|cua so|vách kính/i },
    { key: "khac", label: "Công tác khác", order: 99, boMon: "Khác", units: [], formula: "Theo thiết kế, ghi rõ diễn giải", deductions: [], kw: null },
  ];

  const BO_MON = ["Kiến trúc", "Kết cấu", "Điện", "Cấp thoát nước", "PCCC", "Điều hòa thông gió", "Khác"];

  function workType(key) { return WORK_TYPES.find((w) => w.key === key) || WORK_TYPES[WORK_TYPES.length - 1]; }
  function classify(row) {
    const text = [row.noiDung, row.hangMuc, row.ma].join(" ");
    if (/-TU-/i.test(row.ma || "") || /phá dỡ|tháo dỡ|pha do|thao do/i.test(text)) return "pha_do";
    for (const w of WORK_TYPES) if (w.kw && w.key !== "pha_do" && w.kw.test(text)) return w.key;
    return "khac";
  }
  function floorOrder(t) {
    const s = String(t || "").toUpperCase();
    let m = s.match(/^B(\d+)/); if (m) return -Number(m[1]);
    m = s.match(/^T(\d+)/); if (m) return Number(m[1]);
    if (/MÁI|MAI|TUM/.test(s)) return 900;
    return 999;
  }
  function sortRows(rows) {
    const bm = (b) => { const i = BO_MON.indexOf(b || ""); return i < 0 ? 99 : i; };
    return rows.slice().sort((a, b) =>
      (workType(a.loaiCongTac).order - workType(b.loaiCongTac).order) || (bm(a.boMon) - bm(b.boMon)) ||
      String(a.hangMuc || "").localeCompare(String(b.hangMuc || "")) || (floorOrder(a.tang) - floorOrder(b.tang)) ||
      String(a.ma || "").localeCompare(String(b.ma || ""), "vi", { numeric: true }));
  }

  /** TT 36/2026/TT-BXD Phụ lục III — Bảng 3.8 tổng hợp dự toán chi phí xây dựng. */
  const COST_STRUCTURE = [
    { key: "T", label: "I. Chi phí trực tiếp", formula: "VL + NC + M", src: "TT 36 PL III Bảng 3.8; NĐ 206 Điều 12" },
    { key: "C", label: "II.1 Chi phí chung", formula: "T × tỷ lệ (Bảng 3.3)", src: "TT 36 PL III mục 3.1" },
    { key: "TT", label: "II.2 Chi phí một số công việc không xác định được khối lượng từ thiết kế", formula: "T × tỷ lệ (Bảng 3.5)", src: "TT 36 PL III mục 3.2" },
    { key: "GT", label: "II. Chi phí gián tiếp", formula: "C + TT", src: "TT 36 PL III Bảng 3.8" },
    { key: "TL", label: "III. Thu nhập chịu thuế tính trước", formula: "(T + GT) × tỷ lệ (Bảng 3.6)", src: "TT 36 PL III mục 4" },
    { key: "GXDTT", label: "Chi phí xây dựng trước thuế", formula: "T + GT + TL", src: "TT 36 PL III Bảng 3.8" },
    { key: "GTGT", label: "IV. Thuế GTGT", formula: "GXDTT × thuế suất", src: "TT 36 PL III Bảng 3.8" },
    { key: "GXD", label: "Chi phí xây dựng sau thuế", formula: "GXDTT + GTGT", src: "TT 36 PL III Bảng 3.8" },
    { key: "LT", label: "V. Chi phí nhà tạm để ở và điều hành thi công", formula: "GXDTT × tỷ lệ (Bảng 3.7) × (1 + thuế suất GTGT)", src: "TT 36 PL III mục 5; Bảng 3.8 ghi “GXDTT x Tỷ lệ x TGTGT” — app hiểu là kèm thuế, " + VERIFY },
    { key: "DP", label: "Dự phòng (khoản mục riêng trong dự toán xây dựng)", formula: "người dùng nhập theo NĐ 206", src: "NĐ 206/2026/NĐ-CP Điều 12 — " + VERIFY },
  ];

  /** Gợi ý tỷ lệ — trích từ TT 36/2026/TT-BXD PL III, chỉ dòng "Công trình dân dụng" và "Công trình xây dựng còn lại". Người dùng phải xác nhận theo loại & quy mô. */
  const PRESETS_TT36 = {
    note: "Trích TT 36/2026/TT-BXD Phụ lục III (Bảng 3.3, 3.5, 3.6, 3.7) — dòng Công trình dân dụng. Kiểm tra lại loại công trình, quy mô và trường hợp đặc biệt (vùng núi, hải đảo ×1,1; tu bổ di tích…) trước khi dùng.",
    chiPhiChung: { brackets: [40, 60, 100, 300, 500, 750, 1000, Infinity], dan_dung: [7.3, 7.1, 6.7, 6.5, 6.2, 6.1, 6.0, 5.8], unit: "tỷ đồng chi phí xây dựng trước thuế" },
    khongXacDinhKL: { dan_dung: 2.5 },
    tnctt: { dan_dung: 5.5 },
    nhaTam: { brackets: [15, 100, 500, 1000, Infinity], con_lai: [1.1, 1.0, 0.95, 0.9, 0.85], theo_tuyen: [2.2, 2.0, 1.9, 1.8, 1.7] },
  };
  function presetFor(gxdBillion, kind) {
    const p = PRESETS_TT36;
    const pick = (br, arr) => { for (let i = 0; i < br.length; i++) if (gxdBillion <= br[i]) return arr[i]; return arr[arr.length - 1]; };
    return {
      cpc: pick(p.chiPhiChung.brackets, p.chiPhiChung.dan_dung),
      tt: p.khongXacDinhKL.dan_dung,
      tnctt: p.tnctt.dan_dung,
      lt: pick(p.nhaTam.brackets, kind === "tuyen" ? p.nhaTam.theo_tuyen : p.nhaTam.con_lai),
    };
  }

  /** 9 bước lập dự toán. Bước bắt buộc chặn chuyển bước khi còn thiếu. */
  const WIZARD_STEPS = [
    { n: 1, key: "info", title: "Thông tin công trình", desc: "Tên, cấp, loại, địa điểm, căn cứ pháp lý.", required: true },
    { n: 2, key: "docs", title: "Nhận & kiểm tra hồ sơ bản vẽ", desc: "Checklist theo bộ môn; kiểm tra chuẩn layer (hồ sơ chưa chuẩn).", required: true },
    { n: 3, key: "list", title: "Lập danh mục công việc", desc: "Theo bộ môn, hạng mục, tầng; sắp theo trình tự thi công.", required: true },
    { n: 4, key: "takeoff", title: "Đo bóc khối lượng có diễn giải", desc: "Mỗi dòng có diễn giải công thức và nguồn (QĐ 1041 I.6).", required: true },
    { n: 5, key: "check", title: "Kiểm tra chéo", desc: "Bản vẽ ↔ BKL, trùng lặp, đơn vị, tỷ lệ.", required: true },
    { n: 6, key: "price", title: "Áp mã định mức & đơn giá", desc: "Mỗi dòng có mã hiệu giá; đơn vị khớp loại giá (QĐ 1041 I.3, I.5).", required: true },
    { n: 7, key: "cost", title: "Tổng hợp chi phí", desc: "Trực tiếp, gián tiếp, TNCTT, VAT, nhà tạm, dự phòng (TT 36 PL III, NĐ 206 Đ.12).", required: true },
    { n: 8, key: "pricecheck", title: "Kiểm giá", desc: "Đối chiếu bảng giá tham chiếu / công trình cũ.", required: true },
    { n: 9, key: "report", title: "Báo cáo & duyệt", desc: "Người kiểm tra, ngày duyệt, kết luận; xuất Excel/PDF.", required: true },
  ];

  const DOC_CHECKLIST = ["Kiến trúc", "Kết cấu", "Điện", "Cấp thoát nước", "PCCC", "Điều hòa thông gió"];

  const LEGAL_BASIS_SUGGEST = [
    "Nghị định 206/2026/NĐ-CP về quản lý chi phí đầu tư xây dựng",
    "Thông tư 36/2026/TT-BXD hướng dẫn xác định và quản lý chi phí đầu tư xây dựng",
    "Thông tư 37/2026/TT-BXD hướng dẫn phương pháp xác định định mức dự toán và chỉ tiêu kinh tế kỹ thuật",
    "Thông tư 38/2026/TT-BXD ban hành định mức xây dựng",
    "Quyết định 1041/QĐ-BXD công bố Hướng dẫn xác định khối lượng công trình (tham khảo)",
  ];

  return { VERIFY, SOURCES, PRINCIPLES, NOTE_NO_DETAIL, WORK_TYPES, BO_MON, workType, classify, sortRows, floorOrder,
    COST_STRUCTURE, PRESETS_TT36, presetFor, WIZARD_STEPS, DOC_CHECKLIST, LEGAL_BASIS_SUGGEST };
});
