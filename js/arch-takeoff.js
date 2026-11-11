/* Bóc khối lượng tự động từ DXF kiến trúc theo hồ sơ chuẩn layer (PiArch).
 * Tường: polyline kín 4 đỉnh → L tim = (s + √(s² − 4A)) / 2, t = A / L (s = chu vi / 2).
 * Mỗi kết quả có "diễn giải" và nguồn (QĐ 1041/QĐ-BXD Mục I.6). */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiArchTakeoff = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  const Arch = () => root.PiArch || (typeof require === "function" ? require("./arch-standard.js") : null);

  const DEFAULTS = { tipMaxMm: 80, ambiguityGapMm: 150, freeEndTolMm: 30, hostWallMaxMm: 400, leaderSnapFactor: 6 };

  function fmt(n, d) {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
    const s = Number(n).toFixed(d === undefined ? 0 : d).split(".");
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return s[1] && /[1-9]/.test(s[1]) ? s[0] + "," + s[1].replace(/0+$/, "") : s[0];
  }
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function polyArea(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a) / 2; }
  function polyPerim(pts, closed) { let s = 0; const n = pts.length; for (let i = 0; i < (closed ? n : n - 1); i++) s += dist(pts[i], pts[(i + 1) % n]); return s; }
  function distPointSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
  }
  function distPointPoly(p, pts) {
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) best = Math.min(best, distPointSeg(p, pts[i], pts[(i + 1) % pts.length]));
    return best;
  }
  function pointInPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], b = pts[j];
      if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y || 1e-12) + a.x) inside = !inside;
    }
    return inside;
  }
  function cleanMText(t) {
    return String(t || "")
      .replace(/\\P/g, " ").replace(/\\[A-Za-z][^;\\{}]*;/g, "").replace(/\\[LlOoKk]/g, "").replace(/[{}]/g, "")
      .replace(/%%[cC]/g, "Ø").replace(/\s+/g, " ").normalize("NFC").trim();
  }
  function entPoint(e) { return e.position || e.startPoint || (e.vertices && e.vertices[0]) || null; }

  function blockBBox(dxf, name) {
    const b = dxf.blocks && dxf.blocks[name];
    if (!b || !b.entities) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (p) => { if (!p || !Number.isFinite(p.x)) return; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
    b.entities.forEach((e) => { (e.vertices || []).forEach(add); add(e.position); add(e.startPoint); add(e.endPoint); });
    if (!Number.isFinite(x0)) return null;
    const base = b.position || { x: 0, y: 0 };
    return { x0: x0 - (base.x || 0), y0: y0 - (base.y || 0), x1: x1 - (base.x || 0), y1: y1 - (base.y || 0) };
  }

  function floorFromTitle(t) {
    const s = String(t || "").toUpperCase().normalize("NFC");
    let m = s.match(/TẦNG\s+HẦM\s*(B?\d+)/); if (m) return m[1].startsWith("B") ? m[1] : "B" + m[1];
    m = s.match(/TẦNG\s+(\d+)/); if (m) return "T" + m[1];
    if (/TẦNG\s+TRỆT/.test(s)) return "T1";
    if (/MÁI|TUM/.test(s)) return "MAI";
    return "";
  }
  function floorLabel(f) {
    if (!f) return "Chưa rõ tầng";
    if (/^B\d/.test(f)) return "Tầng hầm " + f;
    if (/^T\d/.test(f)) return "Tầng " + f.slice(1);
    if (f === "MAI") return "Mái";
    return f;
  }
  function kindFromTitle(kyHieu, title) {
    const k = String(kyHieu || "").toUpperCase(), t = String(title || "").toUpperCase().normalize("NFC");
    if (/^PD/.test(k) || /THÁO DỠ|PHÁ DỠ/.test(t)) return "PD";
    if (/^XM/.test(k) || /XÂY MỚI/.test(t)) return "XM";
    if (/^BKL/.test(k) || /KHỐI LƯỢNG/.test(t)) return "BKL";
    if (/^HT/.test(k) || /HIỆN TRẠNG/.test(t)) return "HT";
    return k.replace(/[-\d]+$/, "") || "";
  }

  const TAG_RE = /^((B\d|T\d{1,2}|M|MAI)-([A-Z]{1,4})-(\d{1,3}))/;

  function analyze(dxf, opts) {
    const A = Arch();
    const o = Object.assign({}, DEFAULTS, (opts && opts.settings) || {});
    const profile = (opts && opts.profile) || A.defaultProfile();
    const floors = (opts && opts.floors) || {};
    const ents = dxf.entities || [];
    const catOf = (layer) => { const r = A.layerRule(profile, layer); return r ? r.cat : null; };
    const hOfLayer = (layer) => { const r = A.layerRule(profile, layer); return r && Number(r.hMm) > 0 ? Number(r.hMm) : null; };
    const warnings = [];

    // 1) Khung bản vẽ từ block khung tên
    const frames = [];
    ents.forEach((e) => {
      if (e.type !== "INSERT") return;
      const br = A.blockRule(profile, e.name);
      if (!br || br.cat !== "titleblock") return;
      const bb = blockBBox(dxf, e.name);
      const sx = Math.abs(e.xScale || 1), sy = Math.abs(e.yScale || e.xScale || 1);
      const p = e.position || { x: 0, y: 0 };
      const at = e.attribs || {};
      const title = at.TENBANVE || at.TITLE || "";
      const kyHieu = at.KYHIEU || at.SHEET || "";
      frames.push({
        idx: frames.length, handle: e.handle, kyHieu, title,
        x0: p.x + (bb ? bb.x0 * sx : 0), y0: p.y + (bb ? bb.y0 * sy : 0),
        x1: p.x + (bb ? bb.x1 * sx : 0), y1: p.y + (bb ? bb.y1 * sy : 0),
        kind: kindFromTitle(kyHieu, title), floor: floorFromTitle(title), hasBBox: !!bb,
      });
    });
    function frameOf(p) {
      if (!p) return null;
      for (const f of frames) if (f.hasBBox && p.x >= f.x0 && p.x <= f.x1 && p.y >= f.y0 && p.y <= f.y1) return f.idx;
      return null;
    }
    if (!frames.length) warnings.push("Không thấy block khung tên trong hồ sơ chuẩn — mọi đối tượng gộp chung một tờ, không tách được tầng.");

    // 2) Tường
    const walls = [];
    ents.forEach((e) => {
      if (e.type !== "LWPOLYLINE" && e.type !== "POLYLINE") return;
      const cat = catOf(e.layer);
      if (!cat || !/^wall/.test(cat)) return;
      const pts = (e.vertices || []).map((v) => ({ x: v.x, y: v.y }));
      if (pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
      const closed = !!e.shape || e.closed;
      if (pts.length < 3 || !closed) return;
      const P = polyPerim(pts, true), Ar = polyArea(pts), s = P / 2;
      const disc = s * s - 4 * Ar;
      const L = disc >= 0 ? (s + Math.sqrt(disc)) / 2 : s / 2;
      const t = L > 0 ? Ar / L : 0;
      const c = pts.reduce((acc, q) => ({ x: acc.x + q.x / pts.length, y: acc.y + q.y / pts.length }), { x: 0, y: 0 });
      walls.push({ id: "W" + walls.length, handle: e.handle, layer: e.layer, cat, pts, L, t, rect: pts.length === 4, hLayer: hOfLayer(e.layer), frame: frameOf(c), center: c });
    });

    // 3) Tag + leader
    const leaders = [];
    ents.forEach((e) => {
      if (catOf(e.layer) !== "leader") return;
      const v = e.vertices || [];
      for (let i = 0; i + 1 < v.length; i++) leaders.push([{ x: v[i].x, y: v[i].y }, { x: v[i + 1].x, y: v[i + 1].y }]);
    });
    function leaderTip(p, h) {
      let best = null;
      leaders.forEach(([a, b]) => { [[a, b], [b, a]].forEach(([near, far]) => { const d0 = dist(near, p); if (!best || d0 < best.d) best = { d: d0, near, far }; }); });
      if (!best || best.d > (h || 200) * o.leaderSnapFactor) return null;
      let prev = best.near, tip = best.far;
      for (let k = 0; k < 6; k++) {
        let nxt = null;
        leaders.forEach(([a, b]) => { [[a, b], [b, a]].forEach(([s0, e0]) => { if (dist(s0, tip) < 1 && dist(e0, prev) > 1) nxt = e0; }); });
        if (!nxt) break; prev = tip; tip = nxt;
      }
      return tip;
    }
    const TYPE_CATS = { TU: ["wall_demo", "wall_keep"], XM: ["wall_new", "wall_keep"], VX: ["wall_new", "wall_keep"] };
    const tags = [];
    ents.forEach((e) => {
      if ((e.type !== "MTEXT" && e.type !== "TEXT") || catOf(e.layer) !== "tag") return;
      const text = cleanMText(e.text);
      const m = text.toUpperCase().match(TAG_RE);
      if (!m) return;
      const p = entPoint(e);
      const tag = { code: m[1], floorCode: m[2], type: m[3], text, keep: /GIỮ LẠI|GIU LAI/i.test(text), x: p.x, y: p.y, layer: e.layer, frame: frameOf(p), status: "none" };
      const cats = TYPE_CATS[tag.type];
      if (cats) {
        const tip = leaderTip(p, e.height || e.textHeight);
        if (!tip) tag.status = "noleader";
        else {
          tag.tip = tip;
          const cands = walls.filter((w) => w.frame === tag.frame && cats.includes(w.cat)).map((w) => ({ w, d: distPointPoly(tip, w.pts) })).sort((a, b) => a.d - b.d);
          if (!cands.length) tag.status = "nowall";
          else if (cands[0].d > o.tipMaxMm || (cands[1] && cands[1].d < cands[0].d + o.ambiguityGapMm)) { tag.status = "ambiguous"; tag.bestD = cands[0].d; }
          else { tag.status = "matched"; tag.wallId = cands[0].w.id; tag.bestD = cands[0].d; cands[0].w.tagCode = tag.code; }
        }
      }
      tags.push(tag);
    });

    // Mã viết bằng chữ thường (không nằm trên layer tag) trong tờ mặt bằng → "tag sai layer"
    const textCodes = {};
    ents.forEach((e) => {
      if ((e.type !== "MTEXT" && e.type !== "TEXT") || catOf(e.layer) === "tag") return;
      const text = cleanMText(e.text).toUpperCase();
      const m = text.match(TAG_RE);
      if (!m) return;
      const fi = frameOf(entPoint(e));
      const f = fi === null ? null : frames[fi];
      if (f && f.kind === "BKL") return;
      textCodes[m[1]] = { layer: e.layer, text: cleanMText(e.text), frame: fi };
    });

    // floor/kind per frame: fallback majority tag prefix
    frames.forEach((f) => {
      if (!f.floor) {
        const cnt = {}; tags.filter((t) => t.frame === f.idx).forEach((t) => { cnt[t.floorCode] = (cnt[t.floorCode] || 0) + 1; });
        const best = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0];
        if (best) { f.floor = best[0]; f.floorFrom = "tag"; }
      } else f.floorFrom = "title";
    });
    const fr = (i) => (i === null || i === undefined ? null : frames[i]);

    // 4) Cửa / lỗ mở
    const openings = [];
    ents.forEach((e) => {
      if (e.type !== "INSERT") return;
      const br = A.blockRule(profile, e.name);
      const cat = (br && br.cat) || catOf(e.layer);
      if (cat !== "door" && cat !== "window") return;
      const at = e.attribs || {};
      const num = (v) => { const n = parseFloat(String(v || "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };
      const p = e.position;
      const f = frameOf(p);
      const host = walls.filter((w) => w.frame === f).map((w) => ({ w, d: distPointPoly(p, w.pts) })).sort((a, b) => a.d - b.d)[0];
      openings.push({ handle: e.handle, name: e.name, layer: e.layer, cat, code: A.blockCode(e.name, at), rong: num(at.RONG || at.RONG_MM || at.WIDTH), cao: num(at.CAO || at.CAO_MM || at.HEIGHT), frame: f,
        hostWall: host && host.d <= o.hostWallMaxMm ? host.w.id : null, hostCat: host && host.d <= o.hostWallMaxMm ? host.w.cat : null, note: at.GHI_CHU || "" });
    });

    // 5) Diện tích sàn / hoàn thiện + hatch
    const areas = [];
    ents.forEach((e) => {
      const cat = catOf(e.layer);
      if (!cat || !(/^floor/.test(cat) || /^hatch/.test(cat) || cat === "stair")) return;
      if (!(e.type === "LWPOLYLINE" || e.type === "POLYLINE" || e.type === "HATCH")) return;
      if (e.type !== "HATCH" && !e.shape) return;
      const pts = (e.vertices || []).map((v) => ({ x: v.x, y: v.y }));
      if (pts.length < 3) return;
      const c = pts.reduce((acc, q) => ({ x: acc.x + q.x / pts.length, y: acc.y + q.y / pts.length }), { x: 0, y: 0 });
      areas.push({ layer: e.layer, cat, type: e.type, handle: e.handle, areaMm2: polyArea(pts), frame: frameOf(c) });
    });

    // 6) Đầu tường mới hở
    const columns = [];
    ents.forEach((e) => {
      if (e.type !== "INSERT") return;
      const br = A.blockRule(profile, e.name);
      if (!br || br.cat !== "column") return;
      const bb = blockBBox(dxf, e.name); if (!bb) return;
      const sx = e.xScale || 1, sy = e.yScale || sx, rot = ((e.rotation || 0) * Math.PI) / 180, p = e.position;
      const corners = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x1, bb.y1], [bb.x0, bb.y1]].map(([x, y]) => {
        const X = x * sx, Y = y * sy; return { x: p.x + X * Math.cos(rot) - Y * Math.sin(rot), y: p.y + X * Math.sin(rot) + Y * Math.cos(rot) };
      });
      columns.push({ pts: corners, frame: frameOf(p) });
    });
    ents.forEach((e) => { if ((e.type === "LWPOLYLINE") && catOf(e.layer) === "column" && e.shape) columns.push({ pts: e.vertices.map((v) => ({ x: v.x, y: v.y })), frame: frameOf(e.vertices[0]) }); });
    const freeEnds = [];
    walls.filter((w) => w.cat === "wall_new" && w.rect).forEach((w) => {
      const edges = [0, 1, 2, 3].map((i) => ({ a: w.pts[i], b: w.pts[(i + 1) % 4] })).map((g) => ({ ...g, len: dist(g.a, g.b) }));
      const ends = edges.slice().sort((x, y) => x.len - y.len).slice(0, 2);
      ends.forEach((g, k) => {
        const mid = { x: (g.a.x + g.b.x) / 2, y: (g.a.y + g.b.y) / 2 };
        let best = Infinity;
        walls.forEach((v) => { if (v === w || v.frame !== w.frame) return; if (pointInPoly(mid, v.pts)) best = 0; else best = Math.min(best, distPointPoly(mid, v.pts)); });
        columns.forEach((c) => { if (c.frame !== w.frame) return; if (pointInPoly(mid, c.pts)) best = 0; else best = Math.min(best, distPointPoly(mid, c.pts)); });
        if (best > o.freeEndTolMm) freeEnds.push({ wallId: w.id, handle: w.handle, tagCode: w.tagCode || "", end: k + 1, gapMm: best, at: mid, frame: w.frame });
      });
    });

    // 7) Tổng hợp theo tờ (tầng × loại)
    const H_of = (floor, w) => w.hLayer || (floors[floor] && Number(floors[floor].H) > 0 ? Number(floors[floor].H) : null);
    const groups = {};
    walls.forEach((w) => {
      const f = fr(w.frame); const floor = f ? f.floor : ""; const kind = f ? f.kind : "";
      const tRound = Math.round(w.t / 10) * 10;
      const key = [kind, floor, w.cat, tRound, w.hLayer || ""].join("|");
      const g = groups[key] || (groups[key] = { kind, floor, cat: w.cat, t: tRound, hLayer: w.hLayer, n: 0, L: 0, items: [], sheet: f ? f.kyHieu : "" });
      g.n++; g.L += w.L; g.items.push(w);
    });
    const catSum = {};
    walls.forEach((w) => { const f = fr(w.frame); const k = [f ? f.kind : "", f ? f.floor : "", w.cat].join("|"); catSum[k] = (catSum[k] || 0) + w.L; });

    // 8) Dòng khối lượng có diễn giải
    const rows = [];
    const missingH = new Set();
    Object.values(groups).sort((a, b) => (a.kind + a.floor + a.cat + a.t).localeCompare(b.kind + b.floor + b.cat + b.t)).forEach((g) => {
      if (g.cat === "wall_keep") return;
      const H = H_of(g.floor, { hLayer: g.hLayer });
      const verb = g.cat === "wall_demo" ? "Phá dỡ tường/vách" : g.cat === "wall_new" ? "Xây tường/vách mới" : "Tường";
      const Ls = g.items.map((w) => Math.round(w.L));
      const listStr = Ls.length <= 12 ? Ls.map((x) => fmt(x)).join(" + ") : Ls.slice(0, 10).map((x) => fmt(x)).join(" + ") + " + … (" + Ls.length + " đoạn)";
      let kl = 0, dg;
      if (H) { kl = (g.L * H) / 1e6; dg = "ΣL = " + listStr + " = " + fmt(g.L) + " mm; S = ΣL × H = " + fmt(g.L / 1000, 3) + " m × " + fmt(H / 1000, 3) + " m = " + fmt(kl, 2) + " m²"; }
      else { missingH.add(g.floor || "?"); dg = "ΣL = " + listStr + " = " + fmt(g.L) + " mm; THIẾU chiều cao H của " + floorLabel(g.floor) + " — nhập H ở bảng Tầng (không tự giả định)."; }
      rows.push({
        ma: ["DXF", g.floor || "X", g.kind || "", g.t].filter(Boolean).join("-") + (g.hLayer ? "-H" + g.hLayer : ""),
        noiDung: verb + " dày " + g.t + " mm" + (g.hLayer ? " (cao " + g.hLayer + ")" : "") + " — " + floorLabel(g.floor),
        tang: g.floor, hangMuc: (g.kind ? g.kind + " " : "") + floorLabel(g.floor), boMon: "Kiến trúc",
        loaiCongTac: g.cat === "wall_demo" ? "pha_do" : "xay", donVi: "m²", kl, L: Math.round(g.L), day: g.t, H: H || 0,
        kichThuoc: fmt(g.L) + "×" + g.t + (H ? "×" + H : ""), dienGiai: dg,
        nguon: "DXF" + (g.sheet ? " tờ " + g.sheet : "") + ", layer " + [...new Set(g.items.map((w) => w.layer))].join(", ") + ", " + g.n + " polyline (handle " + g.items.slice(0, 6).map((w) => w.handle).join(", ") + (g.n > 6 ? "…" : "") + ")",
        origin: "dxf", source: "dxf-auto", dgVL: 0, dgNC: 0, dgMay: 0,
      });
    });
    if (missingH.size) warnings.push("Thiếu chiều cao tầng H cho: " + [...missingH].map(floorLabel).join(", ") + " — diện tích tường = 0 cho tới khi nhập H.");

    const openStat = {};
    let deductSkipped = 0;
    openings.forEach((op) => {
      const f = fr(op.frame); const kind = f ? f.kind : ""; const floor = f ? f.floor : "";
      const key = kind + "|" + (op.code || "(chưa mã)") + "|" + op.cat;
      const s = openStat[key] || (openStat[key] = { kind, code: op.code, cat: op.cat, n: 0, byFloor: {}, rong: new Set(), cao: new Set(), names: new Set() });
      s.n++; s.byFloor[floor || "?"] = (s.byFloor[floor || "?"] || 0) + 1; if (op.rong) s.rong.add(op.rong); if (op.cao) s.cao.add(op.cao); s.names.add(op.name);
      if (!op.cao || !op.rong) deductSkipped++;
    });
    Object.values(openStat).forEach((s) => {
      const parts = Object.entries(s.byFloor).sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([f, n]) => f + ": " + n);
      rows.push({
        ma: s.code || "(chưa mã)", noiDung: (s.kind === "PD" ? "Tháo dỡ " : s.kind === "XM" ? "Lắp mới " : "") + (s.cat === "window" ? "cửa sổ " : "cửa ") + (s.code || "chưa có mã") + (s.rong.size ? " rộng " + [...s.rong].join("/") + " mm" : ""),
        tang: "", hangMuc: (s.kind ? s.kind + " " : "") + "Cửa", boMon: "Kiến trúc", loaiCongTac: s.kind === "PD" ? "pha_do" : "cua", donVi: "bộ", kl: s.n,
        kichThuoc: [...s.rong].join("/") + (s.cao.size ? "×" + [...s.cao].join("/") : "×(chưa có cao)"),
        dienGiai: "Đếm block " + [...s.names].join(", ") + ": " + parts.join(", ") + " = " + s.n + " bộ",
        nguon: "DXF block " + [...s.names].join(", ") + " (thuộc tính MA_LOAI/RONG/CAO)", origin: "dxf", source: "dxf-auto", dgVL: 0, dgNC: 0, dgMay: 0,
        _openCode: s.code, _openKind: s.kind, _byFloor: s.byFloor,
      });
    });
    if (deductSkipped) warnings.push(deductSkipped + " cửa không có CAO/RONG số → không trừ lỗ cửa vào diện tích tường (ghi rõ trong diễn giải).");

    const areaGroups = {};
    areas.forEach((a) => {
      if (!/^floor|stair/.test(a.cat)) return;
      const f = fr(a.frame); const key = (f ? f.kind : "") + "|" + (f ? f.floor : "") + "|" + a.cat;
      const g = areaGroups[key] || (areaGroups[key] = { kind: f ? f.kind : "", floor: f ? f.floor : "", cat: a.cat, items: [], sum: 0, layers: new Set() });
      g.items.push(a); g.sum += a.areaMm2; g.layers.add(a.layer);
    });
    Object.values(areaGroups).forEach((g) => {
      const m2 = g.sum / 1e6;
      rows.push({
        ma: "DXF-" + (g.floor || "X") + "-SAN", noiDung: (g.cat === "floor_demo" ? "Tháo dỡ sàn / lớp hoàn thiện" : "Hoàn thiện sàn") + " — " + floorLabel(g.floor),
        tang: g.floor, hangMuc: (g.kind ? g.kind + " " : "") + floorLabel(g.floor), boMon: "Kiến trúc", loaiCongTac: g.cat === "floor_demo" ? "pha_do" : "op_lat",
        donVi: "m²", kl: m2, kichThuoc: "", dienGiai: "Σ diện tích " + g.items.length + " vùng kín = " + g.items.map((a) => fmt(a.areaMm2 / 1e6, 2)).join(" + ") + " = " + fmt(m2, 2) + " m²",
        nguon: "DXF layer " + [...g.layers].join(", "), origin: "dxf", source: "dxf-auto", dgVL: 0, dgNC: 0, dgMay: 0,
      });
    });

    const audit = A.audit(dxf, profile);
    const tagStats = { total: tags.length, matched: tags.filter((t) => t.status === "matched").length, ambiguous: tags.filter((t) => t.status === "ambiguous").length, noleader: tags.filter((t) => t.status === "noleader").length };
    return { settings: o, frames, walls, tags, textCodes, tagStats, openings, areas, freeEnds, groups: Object.values(groups), catSum, rows, warnings, audit, deductSkipped, floorLabel };
  }

  return { analyze, DEFAULTS, cleanMText, floorFromTitle, floorLabel, kindFromTitle, fmt };
});
