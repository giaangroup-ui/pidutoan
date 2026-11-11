(function (root) {
  const STORAGE_KEY = "pidutoan.v1";

  function uid(prefix) {
    return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function formatVN(n, digits) {
    if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "—";
    const d = digits === undefined ? 0 : digits;
    const num = Number(n);
    const parts = num.toFixed(d).split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return parts.length > 1 && Number(parts[1]) !== 0 ? parts[0] + "," + parts[1] : (d > 0 && /[1-9]/.test(parts[1] || "") ? parts[0] + "," + parts[1] : parts[0]);
  }

  function formatMoney(n) {
    if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
    return formatVN(Math.round(Number(n)), 0) + " đ";
  }

  function parseNumber(v) {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return Number.isFinite(v) ? v : 0;
    let s = String(v).trim().replace(/\s/g, "");
    if (!s) return 0;
    if (s.includes(",") && s.includes(".")) {
      if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
        s = s.replace(/\./g, "").replace(",", ".");
      } else {
        s = s.replace(/,/g, "");
      }
    } else if (s.includes(",")) {
      const frac = s.split(",")[1] || "";
      s = frac.length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
    }
    const n = parseFloat(s.replace(/[^\d.+-]/g, (ch) => (ch === "." || ch === "+" || ch === "-" ? ch : "")));
    return Number.isFinite(n) ? n : 0;
  }

  function defaultRates() {
    return {
      cpc: 0,
      tt: 0,
      tnctt: 0,
      vat: 10,
      lt: 0,
      duPhong: 0,
      confirmed: false,
      note: "Tỷ lệ do người dùng nhập / xác nhận theo TT 36/2026/TT-BXD Phụ lục III và NĐ 206/2026/NĐ-CP Điều 12. App có nút gợi ý theo bảng của TT 36 (dòng công trình dân dụng) nhưng người dùng phải xác nhận.",
    };
  }

  function defaultState() {
    return {
      version: 1,
      theme: "dark",
      currentProjectId: null,
      projects: [],
      priceBook: (root.PIDUTOAN_SAMPLE_PRICES || []).map((p) => ({ ...p, id: uid("dg") })),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const data = JSON.parse(raw);
      if (!data.version) data.version = 1;
      if (!Array.isArray(data.projects)) data.projects = [];
      if (!Array.isArray(data.priceBook) || !data.priceBook.length) {
        data.priceBook = defaultState().priceBook;
      }
      return data;
    } catch (e) {
      return defaultState();
    }
  }

  function saveState(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function newProject(partial) {
    const now = new Date().toISOString();
    return {
      id: uid("ct"),
      name: (partial && partial.name) || "Công trình mới",
      location: (partial && partial.location) || "",
      owner: (partial && partial.owner) || "",
      createdAt: now,
      updatedAt: now,
      qtyRows: [],
      rates: defaultRates(),
    };
  }

  function rowAmount(row, price) {
    const kl = parseNumber(row.kl);
    const vl = price ? parseNumber(price.dgVL) : parseNumber(row.dgVL);
    const nc = price ? parseNumber(price.dgNC) : parseNumber(row.dgNC);
    const may = price ? parseNumber(price.dgMay) : parseNumber(row.dgMay);
    return {
      kl,
      dgVL: vl,
      dgNC: nc,
      dgMay: may,
      ttVL: kl * vl,
      ttNC: kl * nc,
      ttMay: kl * may,
      total: kl * (vl + nc + may),
    };
  }

  function findPrice(book, code) {
    if (!code) return null;
    return book.find((p) => p.maHieu === code || p.id === code) || null;
  }

  function computeEstimate(project, priceBook) {
    const groups = {};
    const rows = (project.qtyRows || []).map((row) => {
      const price = findPrice(priceBook, row.priceCode);
      const calc = rowAmount(row, price);
      const hangMuc = row.hangMuc || "Chưa phân hạng mục";
      if (!groups[hangMuc]) groups[hangMuc] = { name: hangMuc, rows: [], subtotal: 0 };
      const lined = {
        ...row,
        tenCongTac: (price && price.tenCongTac) || row.noiDung,
        donVi: row.donVi || (price && price.donVi) || "",
        ...calc,
        price,
      };
      groups[hangMuc].rows.push(lined);
      groups[hangMuc].subtotal += calc.total;
      return lined;
    });
    const direct = rows.reduce((s, r) => s + r.total, 0);
    const rates = Object.assign(defaultRates(), project.rates || {});
    const pct = (k) => parseNumber(rates[k]) / 100;
    // Cơ cấu theo TT 36/2026/TT-BXD Phụ lục III Bảng 3.8 (NĐ 206/2026/NĐ-CP Điều 12)
    const cpc = direct * pct("cpc");            // C: chi phí chung = T × tỷ lệ
    const ttkxd = direct * pct("tt");           // TT: công việc không xác định được KL = T × tỷ lệ
    const gianTiep = cpc + ttkxd;               // GT = C + TT
    const tnctt = (direct + gianTiep) * pct("tnctt"); // TL = (T + GT) × tỷ lệ
    const beforeVat = direct + gianTiep + tnctt; // GXDTT
    const vat = beforeVat * pct("vat");          // GTGT
    const afterVat = beforeVat + vat;            // GXD
    const nhaTam = beforeVat * pct("lt") * (1 + pct("vat")); // LT = GXDTT × tỷ lệ × (1 + thuế suất) — cách hiểu, cần xác minh
    const duPhongBase = afterVat + nhaTam;
    const duPhong = duPhongBase * pct("duPhong");
    const grand = duPhongBase + duPhong;
    return { rows, groups: Object.values(groups), direct, cpc, ttkxd, gianTiep, tnctt, beforeVat, vat, afterVat, nhaTam, duPhong, grand, rates };
  }

  function suggestPriceCode(row) {
    const text = ((row.noiDung || "") + " " + (row.ma || "") + " " + (row.hangMuc || "")).toLowerCase();
    const isPd = /phá dỡ|pha do|tháo dỡ|thao do|đập|dap bo/.test(text) || /^pd/i.test(row.hangMuc || "") || /-(tu|hts|cd|cs|ct)-/i.test(row.ma || "");
    const isXm = /xây mới|xay moi|xm-/.test(text) || /^xm/i.test(row.hangMuc || "");
    if (/cửa|cua |cửa sổ|cửa đi|\/cd-|\/cs-|-cd-|-cs-/.test(text) || /-CD-|-CS-/i.test(row.ma || "")) {
      return isXm ? "XM.CUA" : "PD.CUA";
    }
    if (/cầu thang|cau thang|-CT-/.test(text) || /-CT-/i.test(row.ma || "")) return "PD.CT";
    if (/sàn|san |hts|hoàn thiện/.test(text) || /-HTS-/i.test(row.ma || "")) {
      return isXm ? "XM.SAN" : "PD.SAN";
    }
    const thick = parseNumber(row.kichThuoc) || parseNumber((row.noiDung || "").match(/(\d+)\s*mm/i));
    const fromText = (row.noiDung || "").match(/(\d{2,3})\s*mm/i);
    const t = thick || (fromText ? parseNumber(fromText[1]) : 0);
    if (isXm || /^XM/i.test(row.hangMuc || "") || /-XM-/i.test(row.ma || "")) {
      return t >= 180 ? "XM.TU.200" : "XM.TU.110";
    }
    if (isPd || t) {
      return t >= 180 ? "PD.TU.200" : "PD.TU.110";
    }
    return "";
  }

  root.PiCore = {
    STORAGE_KEY,
    uid,
    formatVN,
    formatMoney,
    parseNumber,
    defaultRates,
    defaultState,
    loadState,
    saveState,
    newProject,
    rowAmount,
    findPrice,
    computeEstimate,
    suggestPriceCode,
  };
})(typeof window !== "undefined" ? window : globalThis);
