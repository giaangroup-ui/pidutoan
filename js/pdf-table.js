/* Trích bảng khối lượng từ lớp chữ PDF (pdf.js getTextContent). Chỉ lấy số có trong file — không suy đoán. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiPdfTable = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const UNIT_RE = "(m²|m2|m³|m3|md|m|cái|cai|bộ|bo|kg|tấn|tan|lít|lit|cây|cay|tấm|tam|ca|công|cong|ls|gói|goi|ht|hệ|vị trí)";
  const NUM_RE = /^-?\d[\d.,]*$/;
  const SKIP_RE = /^(tổng|tong|cộng|cong)\b/i;

  function norm(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
      .replace(/[^a-z0-9²³]+/g, " ").trim();
  }

  /** Số kiểu VN/EN. Trả {value, ambiguous} hoặc null. */
  function parseNum(raw) {
    let s = String(raw || "").replace(/\s/g, "");
    if (!NUM_RE.test(s)) return null;
    let ambiguous = false;
    const hasC = s.includes(","), hasD = s.includes(".");
    if (hasC && hasD) {
      s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
    } else if (hasC) {
      s = (s.match(/,/g) || []).length > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
    } else if (hasD) {
      const parts = s.split(".");
      if (parts.length > 2) s = s.replace(/\./g, "");
      else if (parts[1].length === 3 && parts[0] !== "0" && parts[0] !== "-0") {
        ambiguous = true; // "1.234" — hiểu là nghìn theo kiểu VN
        s = s.replace(".", "");
      }
    }
    const v = Number(s);
    return Number.isFinite(v) ? { value: v, ambiguous } : null;
  }

  function classify(str) {
    const h = norm(str);
    if (!h) return null;
    if (h === "ma" || h === "ma hieu" || h === "ma cong tac" || h === "stt ma") return "ma";
    if (h.includes("noi dung") || h.includes("ten cong tac") || h === "cong tac" || h.includes("hang muc cong viec") || h === "dien giai") return "noiDung";
    if (h === "dv" || h === "dvt" || h === "don vi" || h.startsWith("don vi") || h === "d v") return "donVi";
    if (h === "kl" || h.startsWith("khoi luong") || h === "so luong" || h === "sl") return "kl";
    if (h.includes("vi tri")) return "viTri";
    if (h.includes("kich thuoc")) return "kichThuoc";
    if (h.includes("ghi chu")) return "ghiChu";
    return null;
  }

  /** items: [{str, x, y, w, h}] (toạ độ PDF, y hướng lên). */
  function groupLines(items) {
    const list = items.filter((i) => i.str && i.str.trim())
      .map((i) => ({ ...i, str: i.str.trim(), cx: i.x + (i.w || 0) / 2 }))
      .sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    list.forEach((it) => {
      const tol = Math.max(2, 0.45 * (it.h || 8));
      const line = lines.find((L) => Math.abs(L.y - it.y) <= tol);
      if (line) line.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    });
    lines.forEach((L) => {
      L.items.sort((a, b) => a.x - b.x);
      // pdf.js hay tách chữ có dấu thành nhiều mảnh: ghép mảnh sát nhau, thêm khoảng trắng nếu cách xa vừa phải
      const merged = [];
      L.items.forEach((it) => {
        const prev = merged[merged.length - 1];
        const h = it.h || 8;
        if (prev && prev.w) {
          const gap = it.x - (prev.x + prev.w);
          if (gap < h * 0.12) { prev.str += it.str; prev.w = it.x + (it.w || 0) - prev.x; prev.cx = prev.x + prev.w / 2; return; }
          if (gap < h * 0.6) { prev.str += " " + it.str; prev.w = it.x + (it.w || 0) - prev.x; prev.cx = prev.x + prev.w / 2; return; }
        }
        merged.push({ ...it });
      });
      merged.forEach((it) => { it.str = it.str.normalize("NFC").replace(/\s+/g, " ").trim(); });
      L.items = merged;
    });
    return lines.sort((a, b) => b.y - a.y);
  }

  function headerOf(line) {
    const cols = [];
    line.items.forEach((it) => {
      const key = classify(it.str);
      if (key && !cols.some((c) => c.key === key)) cols.push({ key, x: it.x, cx: it.cx });
    });
    const keys = cols.map((c) => c.key);
    if (keys.includes("kl") && (keys.includes("noiDung") || keys.includes("ma"))) return cols;
    return null;
  }

  function nearestCol(cols, it) {
    let best = null, bd = Infinity;
    cols.forEach((c) => {
      const d = Math.min(Math.abs(c.cx - it.cx), Math.abs(c.x - it.x));
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  function rowFromCells(cells, page, raw) {
    const klText = (cells.kl || "").trim();
    const num = parseNum(klText);
    if (!num) return null;
    const noiDung = (cells.noiDung || "").trim();
    const ma = (cells.ma || "").trim();
    if (SKIP_RE.test(noiDung) || SKIP_RE.test(ma)) return null;
    if (!noiDung && !ma) return null;
    return {
      ma, noiDung: noiDung || ma, donVi: (cells.donVi || "").trim(), kl: num.value, klText,
      ambiguous: num.ambiguous, viTri: (cells.viTri || "").trim(), kichThuoc: (cells.kichThuoc || "").trim(),
      page, raw,
    };
  }

  function fallbackLine(text, page) {
    const re = new RegExp("^(.*?\\S)\\s+" + UNIT_RE + "\\s+(-?\\d[\\d.,]*)$", "i");
    const m = text.match(re);
    if (!m) return null;
    let head = m[1].trim();
    let ma = "";
    const mm = head.match(/^([A-Z0-9]{1,4}(?:[.-][A-Z0-9]{1,5}){1,4})\s+(.+)$/);
    if (mm) { ma = mm[1]; head = mm[2]; }
    return rowFromCells({ ma, noiDung: head, donVi: m[2], kl: m[3] }, page, text);
  }

  /** pages: [{page, items}] → {rows, charCount, pagesWithText, headerPages} */
  function extract(pages) {
    const rows = [];
    let charCount = 0, pagesWithText = 0, headerPages = 0;
    pages.forEach(({ page, items }) => {
      const chars = items.reduce((s, i) => s + String(i.str || "").trim().length, 0);
      charCount += chars;
      if (chars >= 10) pagesWithText++;
      const lines = groupLines(items);
      let cols = null;
      lines.forEach((L) => {
        const raw = L.items.map((i) => i.str).join("  ");
        const h = headerOf(L);
        if (h) { cols = h; headerPages++; return; }
        if (cols) {
          const cells = {};
          L.items.forEach((it) => {
            const c = nearestCol(cols, it);
            if (c) cells[c.key] = cells[c.key] ? cells[c.key] + " " + it.str : it.str;
          });
          const r = rowFromCells(cells, page, raw);
          if (r) { rows.push(r); return; }
        }
        const fb = fallbackLine(L.items.map((i) => i.str).join(" "), page);
        if (fb) rows.push(fb);
      });
    });
    return { rows, charCount, pagesWithText, headerPages };
  }

  return { extract, parseNum, groupLines, classify };
});
