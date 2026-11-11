/* Kiểm tra chéo bản vẽ ↔ BKL, kiểm tra nội bộ BKL, kiểm giá. Mỗi lỗi: mức (red/yellow/green/info), lý do, hướng xử lý. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiChecks = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const SAMPLE = "DỮ LIỆU MẪU — hãy hiệu chỉnh từ các công trình của bạn";
  function defaultSettings() {
    return {
      greenPct: 2, yellowPct: 5, priceTolPct: 15, freeEndTolMm: 30, unitTolPct: 0.5,
      ratios: [
        { key: "wallNewPerFloor", label: "m² tường xây mới / m² sàn", min: 0.05, max: 1.5, sample: true, note: SAMPLE },
        { key: "wallDemoPerFloor", label: "m² tường phá dỡ / m² sàn", min: 0.05, max: 2.0, sample: true, note: SAMPLE },
        { key: "doorsPer100", label: "số cửa / 100 m² sàn", min: 0.5, max: 10, sample: true, note: SAMPLE },
      ],
    };
  }
  const TAG_RE = /^((B\d|T\d{1,2}|M|MAI)-([A-Z]{1,4})-(\d{1,3}))$/;
  const fmt = (n, d) => {
    if (n === null || n === undefined || !Number.isFinite(Number(n))) return "—";
    const s = Number(n).toFixed(d === undefined ? 0 : d).split(".");
    s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return s[1] && /[1-9]/.test(s[1]) ? s[0] + "," + s[1].replace(/0+$/, "") : s[0];
  };
  const floorLabel = (f) => (!f ? "?" : /^B/.test(f) ? "Hầm " + f : /^T\d/.test(f) ? "Tầng " + f.slice(1) : f);
  const normUnit = (u) => String(u || "").toLowerCase().replace(/\s/g, "").replace("m2", "m²").replace("m3", "m³").replace(/^cái$|^cai$/, "cái").replace(/^bo$/, "bộ");
  const normText = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, " ").trim();

  function levelForPct(pct, s) {
    const a = Math.abs(pct);
    return a <= s.greenPct ? "green" : a <= s.yellowPct ? "yellow" : "red";
  }
  function bklInfo(row) {
    const m = String(row.ma || "").trim().toUpperCase().match(TAG_RE);
    if (!m) return null;
    const type = m[3];
    const keep = (Number(row.kl) === 0 && /GIỮ LẠI|GIU LAI|không tính/i.test((row.ghiChu || "") + " " + (row.noiDung || ""))) || /giữ lại/i.test(row.noiDung || "");
    const cat = type === "TU" ? (keep ? "wall_keep" : "wall_demo") : type === "XM" ? "wall_new" : null;
    return { code: m[1], floor: m[2], type, cat, kind: type === "TU" ? "PD" : type === "XM" ? "XM" : "", keep };
  }

  function run(input) {
    const s = Object.assign(defaultSettings(), input.settings || {});
    const ax = input.analysis || null;
    const rows = input.rows || [];
    const bkl = rows.filter((r) => r.origin === "bkl");
    const issues = [];
    const add = (level, group, item, reason, action, extra) => issues.push(Object.assign({ level, group, item, reason, action }, extra || {}));

    // A. Hồ sơ chưa chuẩn
    if (ax && ax.audit) {
      ax.audit.unmappedLayers.forEach((l) => add("red", "Chuẩn layer", l.layer, "Layer chưa có trong hồ sơ chuẩn (" + l.count + " đối tượng) — hồ sơ chưa chuẩn", "Thêm layer vào tab Chuẩn layer và chọn loại, hoặc đổi layer trong CAD"));
      ax.audit.uncodedBlocks.forEach((b) => add("yellow", "Chuẩn layer", b.name + " ×" + b.count, b.reason + " (layer " + b.layers.join(", ") + ")", "Đặt thuộc tính MA_LOAI hoặc đổi tên block theo mã (D1, S1, F-01…)"));
      if (ax.tagStats && ax.tagStats.ambiguous + ax.tagStats.noleader > 0)
        add("info", "Bản vẽ", "Tag ↔ tường", ax.tagStats.matched + " tag khớp chắc chắn một tường; " + ax.tagStats.ambiguous + " tag mơ hồ, " + ax.tagStats.noleader + " tag không có leader → chỉ so theo nhóm (tầng × loại).", "Kéo đầu leader chạm đúng tường để so từng dòng");
      (ax.warnings || []).forEach((w) => add("yellow", "Bản vẽ", "Cảnh báo bóc", w, "Bổ sung thông số còn thiếu"));
    }

    // B. So nhóm tầng × loại (chiều dài tường)
    if (ax && bkl.length) {
      const bklSum = {}, bklCats = new Set(), dxfCats = new Set();
      bkl.forEach((r) => { const b = bklInfo(r); if (!b || !b.cat || b.cat === "wall_keep") return; const k = b.kind + "|" + b.floor + "|" + b.cat; bklSum[k] = (bklSum[k] || 0) + (Number(r.L) || 0); bklCats.add(b.cat); });
      Object.keys(ax.catSum).forEach((k) => { const c = k.split("|")[2]; if (c !== "wall_keep") dxfCats.add(c); });
      const keys = new Set([...Object.keys(bklSum), ...Object.keys(ax.catSum).filter((k) => !/wall_keep$/.test(k))]);
      [...keys].sort().forEach((k) => {
        const [kind, floor, cat] = k.split("|");
        if (kind === "BKL" || !floor) return;
        const d = ax.catSum[k] || 0, b = bklSum[k] || 0;
        const label = (cat === "wall_demo" ? "Tường phá dỡ" : "Tường xây mới") + " — " + floorLabel(floor);
        if (!d || !b) {
          const otherHas = !d ? dxfCats.has(cat) : bklCats.has(cat);
          add(otherHas ? "red" : "info", "Khối lượng nhóm", label, (!d ? "Chỉ có trong BKL" : "Chỉ có trong bản vẽ") + " (ΣL " + fmt((d || b) / 1000, 2) + " m)" + (otherHas ? "" : " — nguồn kia không có loại này"), "Kiểm tra layer / tờ BKL tương ứng", { dxf: d / 1000, bkl: b / 1000, unit: "m" });
          return;
        }
        const pct = ((b - d) / d) * 100;
        add(levelForPct(pct, s), "Khối lượng nhóm", label, "ΣL bản vẽ " + fmt(d / 1000, 2) + " m · BKL " + fmt(b / 1000, 2) + " m · lệch " + fmt(b / 1000 - d / 1000, 2) + " m (" + fmt(pct, 1) + "%)",
          Math.abs(pct) <= s.greenPct ? "Đạt" : "So từng dòng; kiểm tra đoạn cắt giao tường / tường thiếu tag", { dxf: d / 1000, bkl: b / 1000, unit: "m", pct });
      });
    }

    // C. So từng dòng (tag khớp chắc chắn) + có mặt mã
    if (ax && bkl.length) {
      const byCode = {};
      bkl.forEach((r) => { const b = bklInfo(r); if (b) (byCode[b.code] = byCode[b.code] || []).push(r); });
      const wallById = {}; ax.walls.forEach((w) => { wallById[w.id] = w; });
      const bklTypes = new Set(Object.keys(byCode).map((c) => c.split("-")[1]));
      const tagCodes = new Set();
      const tagFloorsTypes = new Set();
      ax.tags.forEach((t) => {
        const f = ax.frames[t.frame];
        if (f && f.kind === "BKL") return;
        tagCodes.add(t.code); tagFloorsTypes.add(t.floorCode + "|" + t.type);
        const rs = byCode[t.code];
        if (!rs) return;
        if (t.status === "matched" && rs[0].L) {
          const w = wallById[t.wallId];
          const pct = ((rs[0].L - w.L) / w.L) * 100;
          const lv = levelForPct(pct, s);
          add(lv, "Khối lượng dòng", t.code, "L bản vẽ " + fmt(w.L) + " mm (tường handle " + w.handle + ") · BKL " + fmt(rs[0].L) + " mm · lệch " + fmt(pct, 1) + "%",
            lv === "green" ? "Đạt" : "Đo lại L trên bản vẽ; cập nhật BKL " + (rs[0].bklSheet || "") + " dòng " + (rs[0].bklRow || ""), { dxf: w.L / 1000, bkl: rs[0].L / 1000, unit: "m", pct, code: t.code });
        }
      });
      [...tagCodes].forEach((c) => {
        const type = c.split("-")[1];
        if (!byCode[c] && bklTypes.has(type)) add("red", "Có mặt mã", c, "Chỉ có trong bản vẽ — tag có trên mặt bằng nhưng không có dòng BKL", "Bổ sung dòng vào BKL hoặc xóa tag thừa", { code: c });
      });
      Object.keys(byCode).forEach((c) => {
        const [fl, type] = c.split("-");
        if (tagCodes.has(c)) return;
        const tc = ax.textCodes && ax.textCodes[c];
        if (tc) { add("yellow", "Có mặt mã", c, "Có chữ «" + tc.text + "» trên layer " + tc.layer + " nhưng không phải layer tag — không đối chiếu được tự động", "Chuyển chữ sang layer tag (0-TAG-*) và nối leader tới tường", { code: c }); return; }
        const drawingHas = [...tagFloorsTypes].some((x) => x.split("|")[1] === type);
        add(drawingHas ? "red" : "info", "Có mặt mã", c, "Chỉ có trong BKL — không thấy tag trên bản vẽ" + (drawingHas ? "" : " (bản vẽ này không có loại tag " + type + ")"), "Kiểm tra tag trên " + floorLabel(fl) + " hoặc xóa dòng BKL thừa", { code: c });
      });
    }

    // D. Cửa: bản vẽ ↔ lỗ mở / thống kê
    if (ax) {
      const dxfDoors = {};
      ax.openings.forEach((o) => { if (!o.code) return; const f = ax.frames[o.frame]; if (f && f.kind !== "PD") return; dxfDoors[o.code] = (dxfDoors[o.code] || 0) + 1; });
      const bklDoors = {};
      bkl.filter((r) => r.bklSheet === "TK_CUA" || /^(D|S|DM|CS|CD)\d+$/i.test(r.ma || "")).forEach((r) => { bklDoors[String(r.ma).toUpperCase()] = r; });
      if (Object.keys(bklDoors).length || Object.keys(dxfDoors).length) {
        const codes = new Set([...Object.keys(dxfDoors), ...Object.keys(bklDoors).filter((c) => /^D\d/.test(c) && !/^DM/.test(c))]);
        [...codes].sort().forEach((c) => {
          const d = dxfDoors[c] || 0, r = bklDoors[c];
          if (r && r.klError) { add("red", "Cửa", c, "BKL lỗi công thức: " + r.klError + " — bản vẽ đếm " + d + " bộ", "Sửa công thức TK_CUA (tham chiếu lệch dòng) rồi nhập lại"); return; }
          const b = r ? Number(r.kl) || 0 : 0;
          if (!r) { add("red", "Cửa", c, "Chỉ có trên bản vẽ: " + d + " bộ", "Bổ sung vào bảng thống kê cửa"); return; }
          add(d === b ? "green" : "red", "Cửa", c, "Bản vẽ " + d + " bộ · BKL " + b + " bộ" + (r.dienGiai ? " (" + r.dienGiai + ")" : ""), d === b ? "Đạt" : "Đếm lại block cửa / sửa bảng thống kê", { dxf: d, bkl: b, unit: "bộ" });
        });
      }
      const skipped = ax.openings.filter((o) => !o.cao || !o.rong).length;
      if (skipped) add("info", "Cửa", "Trừ lỗ cửa", skipped + " cửa thiếu RONG/CAO dạng số → không trừ lỗ cửa vào diện tích tường", "Ghi CAO vào thuộc tính block nếu cần trừ lỗ (quy tắc trừ: cần xác minh / người dùng tự cấu hình)");
      (ax.freeEnds || []).forEach((e) => add("yellow", "Tường mới", (e.tagCode || "handle " + e.handle) + " đầu " + e.end, "Đầu tường xây mới hở " + fmt(e.gapMm) + " mm (> " + s.freeEndTolMm + " mm) — không chạm tường giữ lại / tường mới / cột", "Kéo đầu tường chạm tường hiện hữu hoặc xác nhận đầu tự do"));
    }

    // E. Kiểm tra nội bộ mọi dòng KL
    const seen = {};
    rows.forEach((r) => {
      const name = (r.ma || "") + " " + String(r.noiDung || "").slice(0, 40);
      if (r.klError) add("red", "Công thức", name, "Lỗi trong BKL: " + r.klError, "Sửa công thức trong file Excel");
      const kl = Number(r.kl);
      if (kl < 0) add("red", "KL âm / 0", name, "Khối lượng âm (" + kl + ")", "Kiểm tra dấu / công thức");
      else if (!kl && !r.klError) {
        const b = bklInfo(r);
        add(b && b.keep ? "info" : "yellow", "KL âm / 0", name, b && b.keep ? "KL = 0 — dòng giữ lại, không tính" : "Khối lượng bằng 0", b && b.keep ? "" : "Bổ sung kích thước / H tầng hoặc xóa dòng");
      }
      const u = normUnit(r.donVi);
      if (r.L && r.H && kl) {
        const exp = u === "m³" && r.day ? (r.L * r.day * r.H) / 1e9 : u === "m²" ? (r.L * r.H) / 1e6 : null;
        if (exp !== null && Math.abs(kl - exp) / exp * 100 > s.unitTolPct) add("red", "Đơn vị", name, "KL " + fmt(kl, 3) + " " + r.donVi + " ≠ " + (u === "m³" ? "L×dày×H" : "L×H") + " = " + fmt(exp, 3), "Kiểm tra đơn vị / công thức KL");
        if (exp === null) add("red", "Đơn vị", name, "Dòng tường có L, H nhưng đơn vị «" + (r.donVi || "") + "» không phải m²/m³", "Sửa đơn vị");
      }
      if (/^(D|S|DM)\d+$/i.test(r.ma || "") && u && !["bộ", "cái", "m²"].includes(u)) add("red", "Đơn vị", name, "Cửa với đơn vị «" + r.donVi + "»", "Dùng bộ / cái / m² theo loại giá");
      if (r.origin === "bkl" && r.ma) {
        const k = String(r.ma).trim().toUpperCase();
        if (seen[k]) add("red", "Trùng lặp", k, "Mã xuất hiện 2 lần (" + seen[k] + " và " + (r.bklSheet || "") + " dòng " + (r.bklRow || "") + ") — QĐ 1041 Mục I.4: mỗi khối lượng chỉ xác định một lần", "Xóa dòng trùng hoặc đổi mã");
        else seen[k] = (r.bklSheet || "") + " dòng " + (r.bklRow || "");
      }
      if (input.priceBook && r.priceCode) {
        const p = input.priceBook.find((x) => x.maHieu === r.priceCode);
        if (p && p.donVi && u && normUnit(p.donVi) !== u) add("red", "Đơn vị", name, "Đơn vị KL «" + r.donVi + "» khác đơn vị giá «" + p.donVi + "» (" + p.maHieu + ") — QĐ 1041 Mục I.5", "Đổi đơn vị hoặc chọn mã giá đúng đơn vị");
      }
    });
    const sig = {};
    rows.filter((r) => r.origin === "bkl").forEach((r) => {
      if (!r.kichThuoc || !r.viTri) return;
      const k = normText(r.noiDung) + "|" + r.kichThuoc + "|" + normText(r.viTri) + "|" + (r.bklSheet || "");
      if (sig[k] && sig[k] !== r.ma) add("yellow", "Trùng lặp", r.ma + " / " + sig[k], "Cùng nội dung, kích thước, vị trí trên cùng tờ — nghi trùng", "Xác nhận đây là 2 đoạn khác nhau"); else sig[k] = r.ma;
    });
    (input.formulaErrors || []).forEach((e) => add("red", "Công thức", e.sheet + "!" + e.cell, "Công thức " + (e.formula || "") + " cho " + e.error, "Sửa công thức trong file Excel"));
    (input.formulaWarnings || []).forEach((w) => add("yellow", "Công thức", w.sheet + "!" + w.cell, (w.warning || "Công thức chỉ tham chiếu dòng trên") + " (" + (w.formula || "") + ")", "Kiểm tra tham chiếu có lệch dòng không"));

    // F. Tỷ lệ (khoảng mẫu)
    const floors = input.floors || {};
    if (ax) {
      Object.keys(floors).forEach((f) => {
        const san = Number(floors[f].san);
        if (!(san > 0)) return;
        const H = Number(floors[f].H) || 0;
        const area = (cat, kind) => H ? ((ax.catSum[kind + "|" + f + "|" + cat] || 0) * H) / 1e6 : null;
        const vals = {
          wallNewPerFloor: area("wall_new", "XM") !== null ? area("wall_new", "XM") / san : null,
          wallDemoPerFloor: area("wall_demo", "PD") !== null ? area("wall_demo", "PD") / san : null,
          doorsPer100: (ax.openings.filter((o) => ax.frames[o.frame] && ax.frames[o.frame].floor === f).length / san) * 100,
        };
        s.ratios.forEach((rt) => {
          const v = vals[rt.key];
          if (v === null || v === undefined) return;
          const ok = v >= rt.min && v <= rt.max;
          add(ok ? "green" : "yellow", "Tỷ lệ", rt.label + " — " + floorLabel(f), fmt(v, 2) + (ok ? " trong" : " ngoài") + " khoảng " + rt.min + "–" + rt.max + (rt.sample ? " (" + SAMPLE + ")" : ""), ok ? "Đạt" : "Xem lại KL hoặc hiệu chỉnh khoảng từ công trình của bạn");
        });
      });
      if (!Object.values(floors).some((x) => Number(x.san) > 0)) add("info", "Tỷ lệ", "Diện tích sàn", "Chưa nhập diện tích sàn từng tầng → bỏ qua kiểm tra tỷ lệ", "Nhập m² sàn ở bảng Tầng");
    }

    return summarize(issues);
  }

  function priceCheck(input) {
    const s = Object.assign(defaultSettings(), input.settings || {});
    const rows = input.rows || [], book = input.priceBook || [], ref = input.reference || [];
    const issues = [];
    const byMa = {}; ref.forEach((r) => { byMa[String(r.ma).trim().toUpperCase()] = r; });
    const byName = {}; ref.forEach((r) => { if (r.ten) byName[normText(r.ten) + "|" + normUnit(r.donVi)] = r; });
    rows.forEach((r) => {
      const name = (r.ma || "") + " " + String(r.noiDung || "").slice(0, 40);
      const p = book.find((x) => x.maHieu === r.priceCode);
      const unit = p ? (Number(p.dgVL) || 0) + (Number(p.dgNC) || 0) + (Number(p.dgMay) || 0) : (Number(r.dgVL) || 0) + (Number(r.dgNC) || 0) + (Number(r.dgMay) || 0);
      if (!p && !unit) { issues.push({ level: "yellow", group: "Kiểm giá", item: name, reason: "Chưa gán đơn giá", action: "Gán mã đơn giá ở bước 6" }); return; }
      const rf = (p && byMa[String(p.maHieu).toUpperCase()]) || byMa[String(r.ma || "").toUpperCase()] || (p && byName[normText(p.tenCongTac) + "|" + normUnit(p.donVi)]);
      if (p && p.isSample) issues.push({ level: "yellow", group: "Kiểm giá", item: name, reason: "Đơn giá " + p.maHieu + " là dữ liệu mẫu", action: "Thay bằng đơn giá thực tế" });
      if (!rf) { issues.push({ level: "yellow", group: "Kiểm giá", item: name, reason: "chưa có giá đối chiếu (" + fmt(unit) + " đ/" + (r.donVi || "") + ")", action: "Nhập bảng giá tham chiếu có mã " + ((p && p.maHieu) || r.ma || "") }); return; }
      const dev = rf.gia ? ((unit - rf.gia) / rf.gia) * 100 : 0;
      const lv = Math.abs(dev) > s.priceTolPct ? "red" : "green";
      issues.push({ level: lv, group: "Kiểm giá", item: name, reason: "Giá " + fmt(unit) + " · tham chiếu " + fmt(rf.gia) + " (" + rf.ma + ") · lệch " + fmt(dev, 1) + "% (ngưỡng ±" + s.priceTolPct + "%)", action: lv === "red" ? "Giải trình hoặc điều chỉnh đơn giá" : "Đạt", pct: dev });
    });
    return summarize(issues);
  }

  /** Bảng giá tham chiếu từ một công trình cũ: mã đơn giá → đơn giá tổng đã dùng. */
  function referenceFromProject(project, priceBook) {
    const out = {};
    (project.qtyRows || []).forEach((r) => {
      const p = (priceBook || []).find((x) => x.maHieu === r.priceCode);
      if (!p) return;
      out[p.maHieu] = { ma: p.maHieu, ten: p.tenCongTac, donVi: p.donVi, gia: (Number(p.dgVL) || 0) + (Number(p.dgNC) || 0) + (Number(p.dgMay) || 0) };
    });
    return Object.values(out);
  }

  function summarize(issues) {
    const order = { red: 0, yellow: 1, info: 2, green: 3 };
    issues.sort((a, b) => order[a.level] - order[b.level]);
    const counts = { red: 0, yellow: 0, green: 0, info: 0 };
    issues.forEach((i) => { counts[i.level]++; });
    return { issues, counts, at: new Date().toISOString() };
  }

  return { run, priceCheck, defaultSettings, referenceFromProject, bklInfo, SAMPLE };
});
