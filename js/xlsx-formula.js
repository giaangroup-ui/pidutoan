/* Tính công thức Excel đơn giản khi file không lưu giá trị (vd file xuất bằng openpyxl).
   Hỗ trợ: số, chuỗi, ô / vùng (kể cả 'Sheet'!A1), + - * / ^ &, SUM, MIN, MAX, ABS, ROUND, TEXT.
   Không đoán: công thức không tính được → lỗi (#VALUE!, #NAME?, #REF!, #CYCLE!). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiFormula = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  class FErr { constructor(code) { this.code = code; } }
  const colNum = (c) => { let n = 0; for (const ch of c.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; };
  const numCol = (n) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

  const TOKEN_RE = /\s*(?:("(?:[^"]|"")*")|((?:'(?:[^']|'')+'|[A-Za-z0-9_.\u00C0-\u1EF9]+)!\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)|(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?)|(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_.]*)\s*\(|(<>|<=|>=|[-+*/^&(),=<>%]))/y;

  function tokenize(f) {
    const out = []; TOKEN_RE.lastIndex = 0; let m;
    const src = f.replace(/^=/, "");
    while (TOKEN_RE.lastIndex < src.length) {
      const start = TOKEN_RE.lastIndex;
      m = TOKEN_RE.exec(src);
      if (!m) { if (/^\s*$/.test(src.slice(start))) break; throw new FErr("#NAME?"); }
      if (m[1] !== undefined) out.push({ t: "str", v: m[1].slice(1, -1).replace(/""/g, '"') });
      else if (m[2] !== undefined) {
        const i = m[2].lastIndexOf("!");
        let sh = m[2].slice(0, i); if (sh.startsWith("'")) sh = sh.slice(1, -1).replace(/''/g, "'");
        out.push({ t: "ref", sheet: sh, a: m[2].slice(i + 1).replace(/\$/g, "").toUpperCase() });
      } else if (m[3] !== undefined) out.push({ t: "ref", sheet: null, a: m[3].replace(/\$/g, "").toUpperCase() });
      else if (m[4] !== undefined) out.push({ t: "num", v: Number(m[4]) });
      else if (m[5] !== undefined) out.push({ t: "fn", v: m[5].toUpperCase() });
      else out.push({ t: "op", v: m[6] });
    }
    return out;
  }

  function evaluateWorkbook(wb) {
    const errors = [];
    const state = {}; // key → "busy" | "done"
    const key = (sh, a) => sh + "!" + a;

    function cellValue(sheet, a) {
      const ws = wb.Sheets[sheet];
      if (!ws) throw new FErr("#REF!");
      const c = ws[a];
      if (!c) return null;
      if (c.f && state[key(sheet, a)] !== "done") evalCell(sheet, a);
      if (c.t === "e") throw new FErr(c.v || "#VALUE!");
      if (c.t === "z") return null;
      return c.v === undefined ? null : c.v;
    }
    function rangeValues(sheet, a) {
      const [p, q] = a.split(":");
      const pm = p.match(/^([A-Z]+)(\d+)$/), qm = (q || p).match(/^([A-Z]+)(\d+)$/);
      const c1 = colNum(pm[1]), r1 = +pm[2], c2 = colNum(qm[1]), r2 = +qm[2];
      const vals = [];
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++)
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) vals.push(cellValue(sheet, numCol(c) + r));
      return vals;
    }
    function toNum(v) {
      if (v === null || v === "") return 0;
      if (typeof v === "number") return v;
      if (typeof v === "boolean") return v ? 1 : 0;
      const s = String(v).trim();
      if (/^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(s)) return Number(s);
      throw new FErr("#VALUE!");
    }
    function toStr(v) { return v === null ? "" : typeof v === "number" ? String(+v.toPrecision(15)) : String(v); }

    function evalFormula(sheet, f) {
      const tk = tokenize(f); let i = 0;
      const peek = () => tk[i], next = () => tk[i++];
      const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
      function primary() {
        const t = next();
        if (!t) throw new FErr("#VALUE!");
        if (t.t === "num") return t.v;
        if (t.t === "str") return t.v;
        if (t.t === "ref") return t.a.includes(":") ? { range: rangeValues(t.sheet || sheet, t.a) } : cellValue(t.sheet || sheet, t.a);
        if (t.t === "op" && t.v === "(") { const v = expr(); if (!isOp(")")) throw new FErr("#VALUE!"); next(); return v; }
        if (t.t === "op" && t.v === "-") return -toNum(scalar(pow()));
        if (t.t === "op" && t.v === "+") return toNum(scalar(pow()));
        if (t.t === "fn") {
          const args = [];
          if (!isOp(")")) { do { args.push(expr()); } while (isOp(",") && next()); }
          if (!isOp(")")) throw new FErr("#VALUE!"); next();
          return callFn(t.v, args);
        }
        throw new FErr("#VALUE!");
      }
      function scalar(v) { if (v && v.range) { if (v.range.length === 1) return v.range[0]; throw new FErr("#VALUE!"); } return v; }
      function pow() { let a = primary(); while (isOp("^")) { next(); a = Math.pow(toNum(scalar(a)), toNum(scalar(primary()))); } return a; }
      function mul() { let a = pow(); while (isOp("*") || isOp("/")) { const o = next().v; const b = toNum(scalar(pow())); a = toNum(scalar(a)); if (o === "/" && b === 0) throw new FErr("#DIV/0!"); a = o === "*" ? a * b : a / b; } return a; }
      function add() { let a = mul(); while (isOp("+") || isOp("-")) { const o = next().v; const b = toNum(scalar(mul())); a = toNum(scalar(a)); a = o === "+" ? a + b : a - b; } return a; }
      function concat() { let a = add(); while (isOp("&")) { next(); a = toStr(scalar(a)) + toStr(scalar(add())); } return a; }
      function expr() { return concat(); }
      const v = scalar(expr());
      if (i < tk.length) throw new FErr("#NAME?");
      return v;
    }
    function flat(args) { const out = []; args.forEach((a) => (a && a.range ? out.push(...a.range) : out.push(a))); return out; }
    function callFn(name, args) {
      if (name === "SUM") return flat(args).reduce((s, v) => s + (typeof v === "number" ? v : v === null || v === "" ? 0 : args.some((a) => a && a.range) && typeof v === "string" ? 0 : toNum(v)), 0);
      if (name === "MIN" || name === "MAX") { const n = flat(args).filter((v) => typeof v === "number"); if (!n.length) return 0; return name === "MIN" ? Math.min(...n) : Math.max(...n); }
      if (name === "ABS") return Math.abs(toNum(args[0]));
      if (name === "ROUND") { const d = Math.round(toNum(args[1] || 0)); const f = Math.pow(10, d); return Math.round(toNum(args[0]) * f) / f; }
      if (name === "TEXT") {
        const v = toNum(args[0]); const fmt = String(args[1] || "");
        const m = fmt.match(/^0(?:\.(0+))?$/);
        return m ? v.toFixed(m[1] ? m[1].length : 0) : String(v);
      }
      throw new FErr("#NAME?");
    }
    function evalCell(sheet, a) {
      const k = key(sheet, a), c = wb.Sheets[sheet][a];
      if (state[k] === "busy") throw new FErr("#CYCLE!");
      state[k] = "busy";
      try {
        const v = evalFormula(sheet, c.f);
        c.v = v; c.t = typeof v === "number" ? "n" : "s"; c.w = toStr(v); c.computed = true;
      } catch (e) {
        if (!(e instanceof FErr)) throw e;
        c.v = e.code; c.t = "e"; c.w = e.code; c.computed = true;
        errors.push({ sheet, cell: a, formula: "=" + c.f, error: e.code });
      } finally { state[k] = "done"; }
    }
    wb.SheetNames.forEach((sh) => {
      const ws = wb.Sheets[sh];
      Object.keys(ws).forEach((a) => {
        if (a[0] === "!") return;
        const c = ws[a];
        const missing = c && c.f && (c.t === "z" || c.v === undefined || c.v === null || c.v === "");
        if (missing && state[key(sh, a)] !== "done") evalCell(sh, a);
        else if (c && c.f) state[key(sh, a)] = "done";
      });
    });
    // cảnh báo công thức lệch hàng: mọi ô tham chiếu (cùng sheet) đều nằm ở hàng r-1
    const warnings = [];
    wb.SheetNames.forEach((sh) => {
      const ws = wb.Sheets[sh];
      Object.keys(ws).forEach((a) => {
        const c = ws[a]; if (!c || !c.f || a[0] === "!") return;
        const r = +a.match(/\d+$/)[0];
        let toks; try { toks = tokenize(c.f); } catch (e) { return; }
        const refs = toks.filter((t) => t.t === "ref");
        if (!refs.length || refs.some((t) => t.sheet || t.a.includes(":"))) return;
        if (refs.every((t) => +t.a.match(/\d+$/)[0] === r - 1)) warnings.push({ sheet: sh, cell: a, formula: "=" + c.f, warning: "Công thức ở hàng " + r + " chỉ tham chiếu hàng " + (r - 1) + " — có thể lệch hàng" });
      });
    });
    errors.warnings = warnings;
    // lỗi lan truyền: ô lỗi trở thành chuỗi mã lỗi để bộ đọc bảng nhận ra
    wb.SheetNames.forEach((sh) => { const ws = wb.Sheets[sh]; Object.keys(ws).forEach((a) => { const c = ws[a]; if (c && c.t === "e" && c.computed) { c.t = "s"; } }); });
    return errors;
  }

  return { evaluateWorkbook, tokenize };
});
