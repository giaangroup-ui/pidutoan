(function (root) {
  const SKIP_MA = /^(tổng|tong|cộng|cong|cộng phá|cộng xây|stt|#)$/i;

  function normHeader(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function classifyHeader(cell) {
    const h = normHeader(cell);
    if (!h) return null;
    if (h === "ma" || h === "ma hieu" || h.startsWith("ma ")) return "ma";
    if (h.includes("noi dung")) return "noiDung";
    if (h.includes("vi tri") || h === "truc") return "viTri";
    if (h.includes("kich thuoc")) return "kichThuoc";
    if (h === "dv" || h === "don vi" || h.startsWith("don vi")) return "donVi";
    if (h.includes("the tich") || h === "m3") return "m3";
    if (h.includes("khoi luong") || h === "kl" || h === "m2") return "kl";
    if (h === "l mm" || h === "l" || h.startsWith("l ")) return "L";
    if (h.startsWith("day") || h === "day mm") return "day";
    if (h === "h" || h === "h mm" || h.startsWith("h ")) return "H";
    if (h.includes("ghi chu")) return "ghiChu";
    if (h.includes("nguon")) return "nguon";
    if (h.includes("hang muc")) return "hangMuc";
    if (h.includes("don gia vat lieu") || h === "dg vl" || h === "vl") return "dgVL";
    if (h.includes("don gia nhan cong") || h === "dg nc" || h === "nc") return "dgNC";
    if (h.includes("don gia may") || h === "dg may" || h === "may") return "dgMay";
    if (h.includes("don gia")) return "dgVL";
    return null;
  }

  function detectHeader(rows) {
    const limit = Math.min(rows.length, 20);
    let best = null;
    for (let i = 0; i < limit; i++) {
      const row = rows[i] || [];
      const map = {};
      let hits = 0;
      row.forEach((cell, idx) => {
        const key = classifyHeader(cell);
        if (key && map[key] === undefined) {
          map[key] = idx;
          hits++;
        }
      });
      if (map.ma !== undefined && (map.noiDung !== undefined || map.kl !== undefined || map.donVi !== undefined)) {
        if (!best || hits > best.hits) best = { index: i, map, hits };
      }
    }
    return best;
  }

  /** Số chặt: chỉ nhận số thật hoặc chuỗi số (1.234,5 / 1234.5). Chuỗi chữ như "SL_T2" hay "#VALUE!" → NaN (không đoán). */
  function strictNum(v) {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
    const s = String(v).trim().replace(/\s/g, "");
    if (!s || s === "--" || s === "-") return null;
    if (/^#/.test(s)) return NaN;
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, "").replace(",", "."));
    if (/^[-+]?\d+(,\d+)?$/.test(s)) return Number(s.replace(",", "."));
    if (/^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(s)) return Number(s);
    return NaN;
  }
  function numOr0(v) { const n = strictNum(v); return Number.isFinite(n) ? n : 0; }
  function isErr(v) { const n = strictNum(v); return Number.isNaN(n); }

  function cellStr(v) {
    if (v === null || v === undefined) return "";
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return String(v).trim();
  }

  function detectTypeHeader(rows) {
    const limit = Math.min(rows.length, 8);
    for (let i = 0; i < limit; i++) {
      const row = rows[i] || [];
      const norms = row.map(normHeader);
      const maIdx = norms.findIndex((h) => h === "ma loai" || h === "ma");
      if (maIdx < 0) continue;
      if (!norms.some((h) => h.includes("sl ") || h === "tong" || h === "tong ht" || h.includes("rong") || h.includes("dai"))) continue;
      const map = {};
      norms.forEach((h, idx) => {
        if (!h) return;
        if (h === "ma loai" || (h === "ma" && map.ma === undefined)) map.ma = idx;
        else if (h.includes("rong")) map.rong = idx;
        else if (h.includes("dai")) map.dai = idx;
        else if (h === "cao") map.cao = idx;
        else if (h.includes("vat lieu")) map.vatLieu = idx;
        else if (h.includes("so canh")) map.soCanh = idx;
        else if (h === "sl b1") map.slB1 = idx;
        else if (h === "sl t1") map.slT1 = idx;
        else if (h === "sl t2") map.slT2 = idx;
        else if (h === "sl t3") map.slT3 = idx;
        else if (h === "tong ht" || h === "tong") map.kl = idx;
        else if (h.includes("ghi chu")) map.ghiChu = idx;
      });
      if (map.ma !== undefined) return { index: i, map };
    }
    return null;
  }

  function parseTypeSchedule(sheetName, aoa, parseNumber) {
    const header = detectTypeHeader(aoa);
    if (!header) return null;
    const { map, index } = header;
    const out = [];
    for (let r = index + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const ma = cellStr(row[map.ma]);
      if (!ma || SKIP_MA.test(ma) || /^\(/.test(ma) || normHeader(ma) === "ma loai" || normHeader(ma) === "ma") continue;
      const rong = map.rong !== undefined ? cellStr(row[map.rong]) : "";
      const dai = map.dai !== undefined ? cellStr(row[map.dai]) : "";
      const cao = map.cao !== undefined ? cellStr(row[map.cao]) : "";
      const kichThuoc = [dai, rong, cao].filter((x) => x && x !== "--").join("×");
      const errs = [];
      const byFloor = {};
      ["B1", "T1", "T2", "T3"].forEach((f) => {
        const k = "sl" + f; if (map[k] === undefined) return;
        const v = row[map[k]];
        if (isErr(v)) errs.push("SL_" + f + " = «" + cellStr(v) + "» không phải số"); else byFloor[f] = numOr0(v);
      });
      let kl = 0, klError = "";
      if (map.kl !== undefined && isErr(row[map.kl])) { klError = "TỔNG = «" + cellStr(row[map.kl]) + "»"; errs.unshift(klError); }
      else if (map.kl !== undefined) kl = numOr0(row[map.kl]);
      if (!kl && !klError) kl = Object.values(byFloor).reduce((a, b) => a + b, 0);
      const slNote = Object.entries(byFloor).map(([f, n]) => f + "=" + n).join(", ");
      out.push({
        ma,
        noiDung: (sheetName === "TK_CUA" ? "Cửa loại " : "Vật dụng loại ") + ma,
        viTri: slNote,
        kichThuoc,
        donVi: "bộ",
        kl,
        ghiChu: map.ghiChu !== undefined ? cellStr(row[map.ghiChu]) : "",
        hangMuc: sheetName,
        dgVL: 0, dgNC: 0, dgMay: 0,
        source: "excel:" + sheetName, origin: "bkl", bklSheet: sheetName, bklRow: r + 1,
        byFloor, klError: errs.length ? errs.join("; ") : "",
        dienGiai: Object.keys(byFloor).length ? Object.entries(byFloor).map(([f, n]) => f + ": " + n).join(" + ") + " = " + (klError ? "(lỗi công thức tổng)" : kl) + " bộ" : "",
        nguon: "BKL " + sheetName + " dòng " + (r + 1),
        loaiCongTac: sheetName === "TK_CUA" ? "cua" : "khac",
      });
    }
    return { sheet: sheetName, skipped: false, rows: out };
  }

  function parseSheetRows(sheetName, aoa, parseNumber) {
    const header = detectHeader(aoa);
    if (!header) {
      const typed = parseTypeSchedule(sheetName, aoa, parseNumber);
      if (typed) return typed;
      return { sheet: sheetName, skipped: true, rows: [], reason: "Không thấy hàng tiêu đề Mã / Nội dung" };
    }
    const { map, index } = header;
    const out = [];
    for (let r = index + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const ma = cellStr(row[map.ma]);
      const noiDung = map.noiDung !== undefined ? cellStr(row[map.noiDung]) : "";
      if (!ma && !noiDung) continue;
      if (SKIP_MA.test(ma) || SKIP_MA.test(noiDung)) continue;
      const errs = [];
      const pick = (k, label) => { if (map[k] === undefined) return 0; const v = row[map[k]]; if (isErr(v)) { errs.push(label + " = «" + cellStr(v) + "»"); return 0; } return numOr0(v); };
      const L = pick("L", "L");
      const day = pick("day", "Dày");
      const H = pick("H", "H");
      let kl = pick("kl", "Khối lượng");
      const m3 = pick("m3", "Thể tích");
      let donVi = map.donVi !== undefined ? cellStr(row[map.donVi]) : "";
      let kichThuoc = map.kichThuoc !== undefined ? cellStr(row[map.kichThuoc]) : "";
      if (!kichThuoc && (L || day || H)) {
        kichThuoc = [L, day, H].filter((n) => n).join("×");
        if (L && H && !day) kichThuoc = L + "×" + H;
        if (L && day && H) kichThuoc = L + "×" + day + "×" + H;
      }
      if (!kl) {
        if (donVi && /m³|m3/.test(donVi) && m3) kl = m3;
        else if (L && H) kl = (L * H) / 1e6;
        else if (m3) kl = m3;
      }
      if (!donVi) donVi = m3 && !kl ? "m³" : "m²";
      out.push({
        ma,
        noiDung,
        viTri: map.viTri !== undefined ? cellStr(row[map.viTri]) : "",
        kichThuoc,
        donVi,
        kl,
        ghiChu: map.ghiChu !== undefined ? cellStr(row[map.ghiChu]) : "",
        hangMuc: map.hangMuc !== undefined && cellStr(row[map.hangMuc]) ? cellStr(row[map.hangMuc]) : sheetName,
        dgVL: map.dgVL !== undefined ? numOr0(row[map.dgVL]) : 0,
        dgNC: map.dgNC !== undefined ? numOr0(row[map.dgNC]) : 0,
        dgMay: map.dgMay !== undefined ? numOr0(row[map.dgMay]) : 0,
        L, day, H, m3,
        source: "excel:" + sheetName, origin: "bkl", bklSheet: sheetName, bklRow: r + 1,
        klError: errs.join("; "),
        dienGiai: L && H ? (donVi && /m³|m3/.test(donVi) && day ? "L × dày × H = " + L + " × " + day + " × " + H + " / 1e9 = " + (Math.round(kl * 1000) / 1000) + " m³" : "L × H = " + L + " × " + H + " / 1e6 = " + (Math.round(kl * 1000) / 1000) + " m²") : "",
        nguon: "BKL " + sheetName + " dòng " + (r + 1) + (map.nguon !== undefined && cellStr(row[map.nguon]) ? " · " + cellStr(row[map.nguon]).slice(0, 120) : ""),
      });
    }
    return { sheet: sheetName, skipped: false, rows: out };
  }

  function parseWorkbook(workbook, parseNumber) {
    const sheets = [];
    let rows = [];
    let formulaErrors = [];
    if (root.PiFormula) {
      try { formulaErrors = root.PiFormula.evaluateWorkbook(workbook) || []; } catch (e) { formulaErrors = [{ sheet: "", cell: "", error: "Không tính được công thức: " + e.message }]; }
    }
    const formulaWarnings = (formulaErrors && formulaErrors.warnings) || [];
    workbook.SheetNames.forEach((name) => {
      const aoa = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: true, defval: "" });
      const result = parseSheetRows(name, aoa, parseNumber);
      sheets.push({ sheet: name, count: result.rows.length, skipped: result.skipped, reason: result.reason });
      rows = rows.concat(result.rows);
    });
    return { sheets, rows, formulaErrors: Array.from(formulaErrors), formulaWarnings };
  }

  /** Bảng giá tham chiếu: Mã, Tên, ĐV, Giá (một cột giá tổng) — hoặc VL/NC/Máy thì cộng lại. */
  function parseRefPrices(aoa) {
    let hi = -1, map = null;
    for (let i = 0; i < Math.min(aoa.length, 20) && hi < 0; i++) {
      const m = {};
      (aoa[i] || []).forEach((c, idx) => {
        const h = normHeader(c);
        if (!h) return;
        if (m.ma === undefined && (h === "ma" || h.startsWith("ma "))) m.ma = idx;
        else if (m.ten === undefined && (h.startsWith("ten") || h.includes("noi dung"))) m.ten = idx;
        else if (m.dv === undefined && (h === "dv" || h.startsWith("don vi") || h === "dvt")) m.dv = idx;
        else if (h.includes("vat lieu") || h === "vl" || h === "dg vl") m.vl = idx;
        else if (h.includes("nhan cong") || h === "nc" || h === "dg nc") m.nc = idx;
        else if (h.includes("may") && !h.includes("ma ")) m.may = idx;
        else if (m.gia === undefined && (h === "gia" || h.startsWith("gia ") || h.startsWith("don gia") || h === "dg")) m.gia = idx;
      });
      if (m.ma !== undefined && (m.gia !== undefined || m.vl !== undefined)) { hi = i; map = m; }
    }
    if (!map) return [];
    const out = [];
    for (let r = hi + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const ma = cellStr(row[map.ma]);
      if (!ma) continue;
      const gia = map.gia !== undefined ? strictNum(row[map.gia]) : ["vl", "nc", "may"].reduce((s, k) => s + (map[k] !== undefined ? numOr0(row[map[k]]) : 0), 0);
      if (!Number.isFinite(gia)) continue;
      out.push({ ma, ten: map.ten !== undefined ? cellStr(row[map.ten]) : "", donVi: map.dv !== undefined ? cellStr(row[map.dv]) : "", gia });
    }
    return out;
  }

  function parsePriceSheet(aoa, parseNumber) {
    const header = detectHeader(aoa) || (function () {
      const row = aoa[0] || [];
      const map = {};
      row.forEach((cell, idx) => {
        const key = classifyHeader(cell);
        if (key) map[key] = idx;
      });
      return Object.keys(map).length ? { index: 0, map } : null;
    })();
    if (!header) return [];
    const { map, index } = header;
    const out = [];
    for (let r = index + 1; r < aoa.length; r++) {
      const row = aoa[r] || [];
      const maHieu = cellStr(row[map.ma]);
      const ten = map.noiDung !== undefined ? cellStr(row[map.noiDung]) : "";
      if (!maHieu && !ten) continue;
      out.push({
        maHieu,
        tenCongTac: ten,
        donVi: map.donVi !== undefined ? cellStr(row[map.donVi]) : "",
        dgVL: map.dgVL !== undefined ? parseNumber(row[map.dgVL]) : 0,
        dgNC: map.dgNC !== undefined ? parseNumber(row[map.dgNC]) : 0,
        dgMay: map.dgMay !== undefined ? parseNumber(row[map.dgMay]) : 0,
        isSample: false,
        nguon: "Nhập từ file người dùng",
        ngayApDung: "",
        nhom: "",
      });
    }
    return out;
  }

  root.PiExcel = { parseWorkbook, parseRefPrices, strictNum, parseSheetRows, parsePriceSheet, detectHeader, classifyHeader, normHeader };
})(typeof window !== "undefined" ? window : globalThis);
