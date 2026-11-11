/* Quy trình 9 bước, tab Kiểm tra, tab Chuẩn layer. Dùng chung trạng thái với app.js qua ctx. */
(function (root) {
  const R = () => root.PiRules, A = () => root.PiArch, K = () => root.PiChecks, C = () => root.PiCore;
  let ctx = null;
  let wizStep = 1;
  let session = { projectId: null, name: "", dxf: null, analysis: null, loading: false };
  let issueFilter = "all";

  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const $ = (sel, r) => (r || document).querySelector(sel);
  const $$ = (sel, r) => Array.from((r || document).querySelectorAll(sel));
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  const fmt = (n, d) => C().formatVN(n, d === undefined ? 2 : d);
  const touch = (p) => { p.updatedAt = new Date().toISOString(); };
  const LEVEL = { red: "Đỏ", yellow: "Vàng", green: "Xanh", info: "Thông tin" };

  function profile() {
    const st = ctx.getState();
    if (!st.archProfile) { st.archProfile = A().defaultProfile(); ctx.save(); }
    return st.archProfile;
  }
  function ensure(p) {
    p.info = p.info || { cap: "", loai: "", giaiDoan: "Dự toán xây dựng", canCu: "" };
    p.docsCheck = p.docsCheck || { boMon: {}, ackUncoded: false };
    p.floors = p.floors || {};
    p.checkSettings = p.checkSettings || K().defaultSettings();
    p.review = p.review || { nguoiKiemTra: "", ngayDuyet: "", ketLuan: "" };
    p.qtyRows = p.qtyRows || [];
    return p;
  }
  // Chữ ký số liệu KL (bước 5). withPrice: thêm mã/đơn giá (bước 8 kiểm giá).
  function rowsSig(p, withPrice) {
    const rows = p.qtyRows || [];
    const base = rows.length + "|" + rows.reduce((s, r) => s + (Number(r.kl) || 0), 0).toFixed(4) + "|" + rows.map((r) => (r.ma || "") + (r.donVi || "")).join(",") + "|" + JSON.stringify(p.floors || {}) + "|" + (p.dxfMeta ? p.dxfMeta.at : "");
    return withPrice ? base + "|" + rows.map((r) => (r.priceCode || "") + ":" + (Number(r.dgVL) + Number(r.dgNC) + Number(r.dgMay) || 0)).join(",") + "|" + (p.priceRefName || "") : base;
  }

  // ---------- DXF session ----------
  function analyze(p) {
    if (!session.dxf) return null;
    session.analysis = root.PiArchTakeoff.analyze(session.dxf, { profile: profile(), floors: p.floors, settings: { freeEndTolMm: Number(p.checkSettings.freeEndTolMm) || 30 } });
    const a = session.analysis;
    p.dxfMeta = Object.assign(p.dxfMeta || {}, {
      name: session.name, unmapped: a.audit.unmappedLayers.length, uncoded: a.audit.uncodedBlocks.length,
      unmappedList: a.audit.unmappedLayers.slice(0, 50), uncodedList: a.audit.uncodedBlocks.slice(0, 50).map((b) => ({ name: b.name, count: b.count, reason: b.reason })),
      floors: [...new Set(a.frames.map((f) => f.floor).filter(Boolean))], frames: a.frames.length, walls: a.walls.length, tagStats: a.tagStats,
    });
    a.frames.forEach((f) => { if (f.floor && !p.floors[f.floor]) p.floors[f.floor] = { H: "", san: "" }; });
    return a;
  }
  function onDxfLoaded(name, text, dxf) {
    const p = ctx.currentProject(); if (!p) return;
    ensure(p);
    session = { projectId: p.id, name, dxf, analysis: null, loading: false };
    p.dxfMeta = { name, at: new Date().toISOString() };
    analyze(p); touch(p); ctx.save();
    if (root.PiDocs) root.PiDocs.addDoc({ id: "dxf_" + p.id, projectId: "dxf:" + p.id, name, kind: "dxf", addedAt: new Date().toISOString() }, new Blob([text], { type: "application/dxf" })).catch(() => {});
  }
  function ensureSession(p) {
    if (!p || !p.dxfMeta) return;
    if (session.projectId === p.id && session.dxf) { if (!session.analysis) analyze(p); return; }
    if (session.loading || !root.PiDocs) return;
    if (typeof DxfParser === "undefined") { setTimeout(() => ensureSession(p), 800); return; }
    session = { projectId: p.id, name: p.dxfMeta.name, dxf: null, analysis: null, loading: true };
    root.PiDocs.getBlob("dxf_" + p.id).then((blob) => blob && blob.text()).then((text) => {
      if (!text) { session.loading = false; return; }
      session.dxf = root.PiDxfTakeoff.parseText(text); session.loading = false; analyze(p); ctx.render();
    }).catch((e) => { session.loading = false; console.warn("Không đọc lại được DXF đã lưu", e); });
  }

  // ---------- Kiểm tra ----------
  function runChecks(p) {
    ensure(p);
    const a = session.analysis && session.projectId === p.id ? analyze(p) : null;
    const res = K().run({ analysis: a, rows: p.qtyRows, formulaErrors: (p.bklMeta || {}).formulaErrors, formulaWarnings: (p.bklMeta || {}).formulaWarnings, floors: p.floors, settings: p.checkSettings, priceBook: ctx.getState().priceBook });
    p.lastCheck = { counts: res.counts, at: res.at, issues: res.issues.slice(0, 800), sig: rowsSig(p), withDxf: !!a };
    touch(p); ctx.save();
    return res;
  }
  function runPriceCheck(p) {
    ensure(p);
    let ref = p.priceRef || [];
    if (p.priceRefProject) {
      const other = ctx.getState().projects.find((x) => x.id === p.priceRefProject);
      if (other) ref = ref.concat(K().referenceFromProject(other, ctx.getState().priceBook));
    }
    const res = K().priceCheck({ rows: p.qtyRows, priceBook: ctx.getState().priceBook, reference: ref, settings: p.checkSettings });
    p.lastPriceCheck = { counts: res.counts, at: res.at, issues: res.issues.slice(0, 800), sig: rowsSig(p, true) };
    touch(p); ctx.save();
    return res;
  }

  // ---------- Trạng thái 9 bước ----------
  function stepStatus(p) {
    ensure(p);
    const rows = p.qtyRows;
    const st = ctx.getState();
    const out = {};
    const miss = [];
    if (!p.name) miss.push("tên công trình"); if (!p.info.cap) miss.push("cấp"); if (!p.info.loai) miss.push("loại"); if (!p.location) miss.push("địa điểm"); if (!String(p.info.canCu || "").trim()) miss.push("căn cứ pháp lý");
    out[1] = miss;
    const m2 = [];
    R().DOC_CHECKLIST.forEach((b) => { if (!p.docsCheck.boMon[b]) m2.push("chưa đánh dấu bộ môn " + b); else if (p.docsCheck.boMon[b] === "thieu") m2.push("thiếu hồ sơ " + b); });
    if (!p.dxfMeta && !p.bklMeta && !rows.length) m2.push("chưa nhận bản vẽ / BKL");
    if (p.dxfMeta && p.dxfMeta.unmapped > 0) m2.push(p.dxfMeta.unmapped + " layer chưa chuẩn (hồ sơ chưa chuẩn)");
    if (p.dxfMeta && p.dxfMeta.uncoded > 0 && !p.docsCheck.ackUncoded) m2.push(p.dxfMeta.uncoded + " block chưa có mã — cần xác nhận");
    out[2] = m2;
    const m3 = [];
    if (!rows.length) m3.push("chưa có dòng công việc");
    const noType = rows.filter((r) => !r.loaiCongTac).length; if (noType) m3.push(noType + " dòng chưa có loại công tác");
    const noBm = rows.filter((r) => !r.boMon).length; if (noBm) m3.push(noBm + " dòng chưa có bộ môn");
    const noLoc = rows.filter((r) => !r.tang && !r.hangMuc).length; if (noLoc) m3.push(noLoc + " dòng chưa có hạng mục / tầng");
    out[3] = m3;
    const m4 = [];
    const noDg = rows.filter((r) => Number(r.kl) && !String(r.dienGiai || "").trim()).length; if (noDg) m4.push(noDg + " dòng chưa có diễn giải");
    const noSrc = rows.filter((r) => !(r.nguon || r.source)).length; if (noSrc) m4.push(noSrc + " dòng chưa ghi nguồn");
    const err = rows.filter((r) => r.klError).length; if (err) m4.push(err + " dòng lỗi công thức");
    if (!rows.some((r) => Number(r.kl))) m4.push("chưa có khối lượng");
    out[4] = m4;
    const m5 = [];
    if (!p.lastCheck) m5.push("chưa chạy kiểm tra");
    else { if (p.lastCheck.sig !== rowsSig(p)) m5.push("số liệu đã đổi sau lần kiểm tra — chạy lại"); if (p.lastCheck.counts.red && !String(p.checkAck || "").trim()) m5.push(p.lastCheck.counts.red + " lỗi đỏ chưa xử lý / chưa giải trình"); }
    out[5] = m5;
    const m6 = [];
    const noPrice = rows.filter((r) => Number(r.kl) && !st.priceBook.some((x) => x.maHieu === r.priceCode) && !(Number(r.dgVL) + Number(r.dgNC) + Number(r.dgMay))).length;
    if (noPrice) m6.push(noPrice + " dòng chưa áp mã đơn giá");
    const nu = (u) => String(u || "").toLowerCase().replace("m2", "m²").replace("m3", "m³").trim();
    const badUnit = rows.filter((r) => { const pr = st.priceBook.find((x) => x.maHieu === r.priceCode); return pr && pr.donVi && r.donVi && nu(pr.donVi) !== nu(r.donVi); }).length;
    if (badUnit) m6.push(badUnit + " dòng lệch đơn vị KL ↔ đơn giá");
    out[6] = m6;
    out[7] = p.rates && p.rates.confirmed ? [] : ["chưa xác nhận tỷ lệ chi phí"];
    const m8 = [];
    if (!p.lastPriceCheck) m8.push("chưa chạy kiểm giá");
    else { if (p.lastPriceCheck.sig !== rowsSig(p, true)) m8.push("số liệu đã đổi — chạy lại kiểm giá"); if (p.lastPriceCheck.counts.red && !String(p.priceAck || "").trim()) m8.push(p.lastPriceCheck.counts.red + " dòng lệch giá chưa giải trình"); }
    out[8] = m8;
    const m9 = [];
    if (!p.review.nguoiKiemTra) m9.push("người kiểm tra"); if (!p.review.ngayDuyet) m9.push("ngày duyệt"); if (!p.review.ketLuan) m9.push("kết luận");
    out[9] = m9;
    return out;
  }
  function maxReachable(status) { let n = 1; while (n < 9 && !status[n].length) n++; return n; }

  // ---------- Thành phần dùng chung ----------
  function floorsCard(p) {
    const fl = Object.keys(p.floors).sort((a, b) => R().floorOrder(a) - R().floorOrder(b));
    const rows = fl.map((f) => `<tr><td>${esc(f)}</td><td><input data-fl="${esc(f)}" data-k="H" class="num" value="${esc(p.floors[f].H)}" placeholder="mm"></td><td><input data-fl="${esc(f)}" data-k="san" class="num" value="${esc(p.floors[f].san)}" placeholder="m²"></td><td><button class="btn bad" data-fldel="${esc(f)}">Xóa</button></td></tr>`).join("") || `<tr><td colspan="4" class="empty">Chưa có tầng — tải DXF hoặc thêm tay.</td></tr>`;
    const box = el(`<section class="card"><h3>Tầng — chiều cao H và diện tích sàn</h3>
      <p class="muted">H dùng tính diện tích tường = L × H. Không có H thì app không tự giả định. Diện tích sàn dùng cho kiểm tra tỷ lệ.</p>
      <div class="table-wrap"><table><thead><tr><th>Tầng</th><th>H (mm)</th><th>Sàn (m²)</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="toolbar"><input id="flNew" placeholder="VD: T4" style="width:90px"><button class="btn" id="flAdd">Thêm tầng</button><button class="btn pri" id="flSave">Lưu tầng</button></div></section>`);
    $("#flAdd", box).onclick = () => { const v = $("#flNew", box).value.trim().toUpperCase(); if (v) { p.floors[v] = p.floors[v] || { H: "", san: "" }; ctx.save(); ctx.render(); } };
    $$("[data-fldel]", box).forEach((b) => b.onclick = () => { delete p.floors[b.dataset.fldel]; ctx.save(); ctx.render(); });
    $("#flSave", box).onclick = () => {
      $$("input[data-fl]", box).forEach((i) => { const v = i.value.trim(); p.floors[i.dataset.fl][i.dataset.k] = v === "" ? "" : C().parseNumber(v); });
      if (session.dxf && session.projectId === p.id) analyze(p);
      touch(p); ctx.save(); ctx.flash("Đã lưu thông số tầng.");
    };
    return box;
  }
  function issuesTable(res, opts) {
    const o = opts || {};
    if (!res) return `<p class="muted">Chưa chạy.</p>`;
    const c = res.counts;
    const chips = `<div class="chips"><span class="chip red">Đỏ ${c.red}</span><span class="chip yellow">Vàng ${c.yellow}</span><span class="chip green">Xanh ${c.green}</span><span class="chip info">Thông tin ${c.info}</span><span class="muted">· chạy lúc ${esc(ctx.fmtDate(res.at))}</span></div>`;
    const list = res.issues.filter((i) => issueFilter === "all" || i.level === issueFilter);
    const body = list.map((i, n) => `<tr class="lv-${i.level}"><td>${n + 1}</td><td><span class="chip ${i.level}">${LEVEL[i.level]}</span></td><td>${esc(i.group)}</td><td>${esc(i.item)}</td><td>${esc(i.reason)}</td><td>${esc(i.action || "")}</td></tr>`).join("") || `<tr><td colspan="6" class="empty">Không có mục.</td></tr>`;
    const filt = o.noFilter ? "" : `<div class="toolbar no-print">Lọc: ${["all", "red", "yellow", "green", "info"].map((k) => `<button class="btn ${issueFilter === k ? "pri" : ""}" data-ifilter="${k}">${k === "all" ? "Tất cả" : LEVEL[k]}</button>`).join("")}</div>`;
    return chips + filt + `<div class="table-wrap"><table class="issues"><thead><tr><th>#</th><th>Mức</th><th>Nhóm</th><th>Hạng mục</th><th>Lý do</th><th>Hướng xử lý</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  function bindFilter(box) { $$("[data-ifilter]", box).forEach((b) => b.onclick = () => { issueFilter = b.dataset.ifilter; ctx.render(); }); }

  // ---------- Bước 1..9 ----------
  function step1(p) {
    const caps = ["", "Đặc biệt", "I", "II", "III", "IV", "Chưa xác định"];
    const loais = ["", "Công trình dân dụng", "Công trình công nghiệp", "Công trình giao thông", "Công trình nông nghiệp và môi trường", "Công trình hạ tầng kỹ thuật"];
    const box = el(`<div><div class="grid cols-3">
      <label>Tên công trình<input id="w1Name" value="${esc(p.name)}"></label>
      <label>Địa điểm<input id="w1Loc" value="${esc(p.location || "")}"></label>
      <label>Chủ đầu tư<input id="w1Owner" value="${esc(p.owner || "")}"></label>
      <label>Cấp công trình<select id="w1Cap">${caps.map((c) => `<option ${p.info.cap === c ? "selected" : ""} value="${esc(c)}">${c || "— chọn —"}</option>`).join("")}</select></label>
      <label>Loại công trình<select id="w1Loai">${loais.map((c) => `<option ${p.info.loai === c ? "selected" : ""} value="${esc(c)}">${c || "— chọn —"}</option>`).join("")}</select></label>
      <label>Giai đoạn<input id="w1Gd" value="${esc(p.info.giaiDoan || "")}"></label></div>
      <label>Căn cứ pháp lý (mỗi dòng một văn bản)<textarea id="w1Cc" rows="6">${esc(p.info.canCu || "")}</textarea></label>
      <div class="toolbar"><button class="btn" id="w1Sug">Chèn gợi ý căn cứ</button><button class="btn pri" id="w1Save">Lưu bước 1</button></div>
      <p class="muted">Cấp công trình theo quy định phân cấp hiện hành — người dùng tự xác định. Loại công trình dùng để tra tỷ lệ chi phí ở bước 7.</p></div>`);
    $("#w1Sug", box).onclick = () => { const t = $("#w1Cc", box); const have = t.value; t.value = (have ? have.trim() + "\n" : "") + R().LEGAL_BASIS_SUGGEST.filter((x) => !have.includes(x)).join("\n"); };
    $("#w1Save", box).onclick = () => {
      p.name = $("#w1Name", box).value.trim() || p.name; p.location = $("#w1Loc", box).value.trim(); p.owner = $("#w1Owner", box).value.trim();
      Object.assign(p.info, { cap: $("#w1Cap", box).value, loai: $("#w1Loai", box).value, giaiDoan: $("#w1Gd", box).value.trim(), canCu: $("#w1Cc", box).value });
      touch(p); ctx.save(); ctx.flash("Đã lưu thông tin công trình.");
    };
    return box;
  }
  function step2(p) {
    const opts = [["", "— chọn —"], ["co", "Có hồ sơ"], ["khong", "Không áp dụng"], ["thieu", "Thiếu"]];
    const rows = R().DOC_CHECKLIST.map((b) => `<tr><td>${esc(b)}</td><td><select data-bm="${esc(b)}">${opts.map(([v, l]) => `<option value="${v}" ${p.docsCheck.boMon[b] === v ? "selected" : ""}>${l}</option>`).join("")}</select></td></tr>`).join("");
    const dm = p.dxfMeta;
    const audit = !dm ? `<p class="muted">Chưa tải DXF.</p>` : `<p>DXF: <b>${esc(dm.name)}</b> · ${dm.frames || 0} khung bản vẽ · ${dm.walls || 0} tường · tầng: ${esc((dm.floors || []).join(", ") || "—")}</p>
      ${dm.unmapped ? `<div class="callout bad"><b>Hồ sơ chưa chuẩn:</b> ${dm.unmapped} layer chưa có trong hồ sơ chuẩn: ${esc((dm.unmappedList || []).map((l) => l.layer + " (" + l.count + ")").join(", "))}. Sang tab <b>Chuẩn layer</b> để gán loại.</div>` : `<div class="callout info">Tất cả layer đã có trong hồ sơ chuẩn.</div>`}
      ${dm.uncoded ? `<div class="callout"><b>${dm.uncoded} block chưa có mã:</b> ${esc((dm.uncodedList || []).map((b) => b.name + " ×" + b.count + " — " + b.reason).join("; "))}<label class="inline"><input type="checkbox" id="w2Ack" ${p.docsCheck.ackUncoded ? "checked" : ""}> Đã xem, chấp nhận không đếm theo mã các block này</label></div>` : ""}`;
    const bm = p.bklMeta ? `<p>BKL: <b>${esc(p.bklMeta.name)}</b> · ${p.bklMeta.rows} dòng · ${(p.bklMeta.formulaErrors || []).length} lỗi công thức · ${(p.bklMeta.formulaWarnings || []).length} cảnh báo lệch hàng</p>` : `<p class="muted">Chưa tải BKL.</p>`;
    const box = el(`<div>
      <div class="toolbar"><label class="btn pri">Tải DXF<input type="file" id="w2Dxf" accept=".dxf" hidden></label><label class="btn">Tải BKL Excel<input type="file" id="w2Xlsx" accept=".xlsx,.xls,.csv" hidden></label><label class="btn">Tải PDF / ảnh<input type="file" id="w2Media" accept=".pdf,.jpg,.jpeg,.png,.webp" hidden></label></div>
      <div class="grid cols-2"><div><h3>Checklist hồ sơ theo bộ môn</h3><div class="table-wrap"><table><thead><tr><th>Bộ môn</th><th>Trạng thái</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      <div><h3>Kiểm tra bản vẽ</h3>${audit}${bm}</div></div></div>`);
    $$("select[data-bm]", box).forEach((s) => s.onchange = () => { p.docsCheck.boMon[s.dataset.bm] = s.value; touch(p); ctx.save(); ctx.render(); });
    const ack = $("#w2Ack", box); if (ack) ack.onchange = () => { p.docsCheck.ackUncoded = ack.checked; ctx.save(); ctx.render(); };
    $("#w2Dxf", box).onchange = (ev) => ctx.handleDxf(ev.target.files[0]);
    $("#w2Xlsx", box).onchange = (ev) => ctx.handleXlsx(ev.target.files[0]);
    $("#w2Media", box).onchange = (ev) => { const f = ev.target.files[0]; ev.target.value = ""; root.PiMedia.handleFile(f); };
    box.appendChild(floorsCard(p));
    return box;
  }
  function autoClassify(p) {
    p.qtyRows.forEach((r) => {
      if (!r.loaiCongTac) r.loaiCongTac = R().classify(r);
      if (!r.boMon) r.boMon = R().workType(r.loaiCongTac).boMon === "Khác" ? "Kiến trúc" : R().workType(r.loaiCongTac).boMon;
      if (!r.tang) { const m = String(r.ma || "").toUpperCase().match(/^(B\d|T\d{1,2})-/); if (m) r.tang = m[1]; }
    });
    p.qtyRows = R().sortRows(p.qtyRows);
  }
  function step3(p) {
    const wt = R().WORK_TYPES, bm = R().BO_MON;
    const body = p.qtyRows.slice(0, 400).map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.ma)}</td><td>${esc(r.noiDung)}</td>
      <td><select data-f3="boMon" data-id="${r.id}"><option value="">—</option>${bm.map((b) => `<option ${r.boMon === b ? "selected" : ""}>${b}</option>`).join("")}</select></td>
      <td><select data-f3="loaiCongTac" data-id="${r.id}"><option value="">—</option>${wt.map((w) => `<option value="${w.key}" ${r.loaiCongTac === w.key ? "selected" : ""}>${w.order}. ${w.label}</option>`).join("")}</select></td>
      <td><input data-f3="hangMuc" data-id="${r.id}" value="${esc(r.hangMuc || "")}"></td><td><input data-f3="tang" data-id="${r.id}" value="${esc(r.tang || "")}" style="width:60px"></td></tr>`).join("") || `<tr><td colspan="7" class="empty">Chưa có dòng. Tải BKL / DXF ở bước 2 hoặc thêm ở tab Khối lượng.</td></tr>`;
    const box = el(`<div><div class="toolbar"><button class="btn pri" id="w3Auto">Tự phân loại & sắp theo trình tự thi công</button></div>
      <p class="muted">Trình tự: ${wt.filter((w) => w.key !== "khac").map((w) => w.label).join(" → ")}. Đây là trình tự thi công thông thường (gợi ý), sửa được từng dòng.</p>
      ${p.qtyRows.length > 400 ? `<p class="muted">Hiển thị 400/${p.qtyRows.length} dòng.</p>` : ""}
      <div class="table-wrap"><table><thead><tr><th>STT</th><th>Mã</th><th>Nội dung</th><th>Bộ môn</th><th>Loại công tác</th><th>Hạng mục</th><th>Tầng</th></tr></thead><tbody>${body}</tbody></table></div></div>`);
    $("#w3Auto", box).onclick = () => { autoClassify(p); touch(p); ctx.save(); ctx.flash("Đã phân loại và sắp " + p.qtyRows.length + " dòng theo trình tự thi công."); };
    $$("[data-f3]", box).forEach((i) => i.onchange = () => { const r = p.qtyRows.find((x) => x.id === i.dataset.id); if (r) { r[i.dataset.f3] = i.value; touch(p); ctx.save(); } });
    return box;
  }
  function rulesCard(p) {
    const used = new Set(p.qtyRows.map((r) => r.loaiCongTac).filter(Boolean));
    const list = R().WORK_TYPES.filter((w) => w.key !== "khac" && (used.size === 0 || used.has(w.key)));
    const body = list.map((w) => `<tr><td><b>${esc(w.label)}</b><div class="muted">${esc(w.units.join(", "))}</div></td><td>${esc(w.formula)}</td><td>${w.deductions.map((d) => `${esc(d.label)}: <span class="tag sample">${esc(d.status)}</span>`).join("<br>")}</td></tr>`).join("");
    return `<details class="card" ${used.size ? "" : "open"}><summary><b>Quy tắc đo bóc áp dụng</b> (${list.length} loại công tác)</summary>
      <div class="callout">${esc(R().NOTE_NO_DETAIL)}</div>
      <p><b>Nguyên tắc chung — QĐ 1041/QĐ-BXD Mục I</b> (<a href="${R().SOURCES.QD1041.url}" target="_blank" rel="noopener">nguồn</a>):</p>
      <ol class="small">${R().PRINCIPLES.map((x) => `<li>${esc(x.text)}</li>`).join("")}</ol>
      <div class="table-wrap"><table><thead><tr><th>Công tác</th><th>Công thức (hình học)</th><th>Quy tắc trừ / phân nhóm</th></tr></thead><tbody>${body}</tbody></table></div></details>`;
  }
  function step4(p) {
    ensureSession(p);
    const a = session.projectId === p.id ? session.analysis : null;
    const body = p.qtyRows.slice(0, 400).map((r, i) => `<tr class="${r.klError ? "lv-red" : Number(r.kl) && !String(r.dienGiai || "").trim() ? "lv-yellow" : ""}"><td>${i + 1}</td><td>${esc(r.ma)}</td><td>${esc(r.noiDung)}</td><td>${esc(r.donVi)}</td><td class="num">${r.klError ? `<span class="chip red" title="Ô KL trong BKL lỗi">${esc(r.klError)}</span><br><input data-klfix="${r.id}" class="num" style="width:90px" placeholder="KL đúng">` : fmt(r.kl, 3)}</td>
      <td><input data-dg="${r.id}" value="${esc(r.dienGiai || "")}" placeholder="VD: 4,575 × 3,6 = 16,47" style="min-width:260px"></td><td class="muted small">${esc(String(r.nguon || r.source || "").slice(0, 80))}</td></tr>`).join("");
    const dxfRows = a ? a.rows.map((r) => `<tr><td>${esc(r.ma)}</td><td>${esc(r.noiDung)}</td><td>${esc(r.donVi)}</td><td class="num">${fmt(r.kl, 2)}</td><td class="small">${esc(r.dienGiai)}</td></tr>`).join("") : "";
    const box = el(`<div>${rulesCard(p)}
      <section class="card"><h3>Khối lượng bóc tự động từ DXF ${a ? "(" + a.rows.length + " dòng)" : ""}</h3>
      ${a ? `<div class="callout">Đây là KL đo từ bản vẽ để đối chiếu. Nếu bảng đã có BKL cho cùng công tác, <b>đừng</b> thêm cả hai (QĐ 1041 Mục I.4 — mỗi khối lượng chỉ xác định một lần).</div>
        ${(a.warnings || []).map((w) => `<div class="callout bad">${esc(w)}</div>`).join("")}
        <div class="toolbar"><button class="btn" id="w4Add">Thêm KL bản vẽ vào bảng</button></div>
        <div class="table-wrap"><table><thead><tr><th>Mã</th><th>Nội dung</th><th>ĐV</th><th class="num">KL</th><th>Diễn giải</th></tr></thead><tbody>${dxfRows}</tbody></table></div>` : session.loading ? `<p class="muted">Đang đọc lại DXF đã lưu…</p>` : `<p class="muted">Chưa có DXF (tải ở bước 2).</p>`}</section>
      <section class="card"><h3>Diễn giải từng dòng (${p.qtyRows.length} dòng)</h3><p class="muted">Mỗi dòng cần diễn giải công thức và nguồn (QĐ 1041 Mục I.6). Dòng tô vàng: thiếu diễn giải.</p>
      <div class="toolbar"><button class="btn pri" id="w4Save">Lưu diễn giải</button></div>
      <div class="table-wrap"><table><thead><tr><th>STT</th><th>Mã</th><th>Nội dung</th><th>ĐV</th><th class="num">KL</th><th>Diễn giải</th><th>Nguồn</th></tr></thead><tbody>${body}</tbody></table></div></section></div>`);
    box.insertBefore(floorsCard(p), box.children[1]);
    const add = $("#w4Add", box);
    if (add) add.onclick = () => {
      if (p.qtyRows.some((r) => r.origin === "bkl") && !confirm("Bảng đang có dòng BKL. Thêm KL bản vẽ có thể tính trùng. Vẫn thêm?")) return;
      a.rows.forEach((r) => { const c = Object.assign({ id: C().uid("kl"), priceCode: "" }, r); Object.keys(c).forEach((k) => { if (k.startsWith("_")) delete c[k]; }); p.qtyRows.push(c); });
      touch(p); ctx.save(); ctx.flash("Đã thêm " + a.rows.length + " dòng KL bóc từ DXF.");
    };
    $("#w4Save", box).onclick = () => {
      $$("input[data-dg]", box).forEach((i) => { const r = p.qtyRows.find((x) => x.id === i.dataset.dg); if (r) r.dienGiai = i.value; });
      let fixed = 0, bad = 0;
      $$("input[data-klfix]", box).forEach((i) => {
        if (!i.value.trim()) return;
        const v = Number(i.value.trim().replace(/\s/g, "").replace(",", "."));
        const r = p.qtyRows.find((x) => x.id === i.dataset.klfix);
        if (!r) return;
        if (!isFinite(v) || v < 0) { bad++; return; }
        r.klNote = "KL nhập tay thay ô lỗi " + r.klError + " (" + new Date().toLocaleDateString("vi-VN") + ")";
        r.kl = v; delete r.klError; fixed++;
      });
      touch(p); ctx.save(); ctx.flash("Đã lưu diễn giải" + (fixed ? "; sửa " + fixed + " ô KL lỗi" : "") + (bad ? "; " + bad + " ô không phải số hợp lệ" : "") + ".");
    };
    return box;
  }
  function checkPanel(p, inWizard) {
    ensureSession(p);
    const s = p.checkSettings;
    const ratioRows = s.ratios.map((r, i) => `<tr><td>${esc(r.label)}</td><td><input data-ratio="${i}" data-k="min" class="num" value="${r.min}"></td><td><input data-ratio="${i}" data-k="max" class="num" value="${r.max}"></td><td>${r.sample ? `<span class="tag sample">${esc(K().SAMPLE)}</span>` : "người dùng"}</td></tr>`).join("");
    const box = el(`<div>
      <section class="card no-print"><h3>Ngưỡng kiểm tra</h3><div class="grid cols-4">
        <label>Xanh ≤ (%)<input id="ckG" type="number" step="0.1" value="${s.greenPct}"></label>
        <label>Vàng ≤ (%) — trên là đỏ<input id="ckY" type="number" step="0.1" value="${s.yellowPct}"></label>
        <label>Đầu tường hở > (mm)<input id="ckF" type="number" value="${s.freeEndTolMm}"></label>
        <label>Kiểm giá ± (%)<input id="ckP" type="number" step="0.5" value="${s.priceTolPct}"></label></div>
        <details><summary>Khoảng tỷ lệ (dữ liệu mẫu — hiệu chỉnh từ công trình của bạn)</summary><div class="table-wrap"><table><thead><tr><th>Tỷ lệ</th><th>Min</th><th>Max</th><th>Nguồn</th></tr></thead><tbody>${ratioRows}</tbody></table></div></details>
        <div class="toolbar"><button class="btn" id="ckSave">Lưu ngưỡng</button><button class="btn pri" id="ckRun">Chạy kiểm tra</button>${inWizard ? "" : `<button class="btn" id="ckXlsx">Xuất Excel</button><button class="btn" id="ckPrint">In / PDF</button>`}</div>
        <p class="muted">Nguồn so: ${p.dxfMeta ? "DXF «" + esc(p.dxfMeta.name) + "»" : "chưa có DXF"} · ${p.bklMeta ? "BKL «" + esc(p.bklMeta.name) + "»" : "chưa có BKL"} · ${p.qtyRows.length} dòng KL. ${p.lastCheck && p.lastCheck.sig !== rowsSig(p) ? "<b>Số liệu đã đổi — hãy chạy lại.</b>" : ""}</p></section>
      <section class="card"><h3>Kết quả kiểm tra chéo</h3>${issuesTable(p.lastCheck)}</section></div>`);
    if (!inWizard) box.appendChild(floorsCard(p));
    const saveS = () => {
      s.greenPct = C().parseNumber($("#ckG", box).value); s.yellowPct = C().parseNumber($("#ckY", box).value);
      s.freeEndTolMm = C().parseNumber($("#ckF", box).value); s.priceTolPct = C().parseNumber($("#ckP", box).value);
      $$("input[data-ratio]", box).forEach((i) => { s.ratios[i.dataset.ratio][i.dataset.k] = C().parseNumber(i.value); });
      touch(p); ctx.save();
    };
    $("#ckSave", box).onclick = () => { saveS(); ctx.flash("Đã lưu ngưỡng kiểm tra."); };
    $("#ckRun", box).onclick = () => {
      saveS();
      if (p.dxfMeta && !session.dxf) { ctx.flash("Đang đọc lại DXF đã lưu — bấm Chạy lại sau vài giây."); ensureSession(p); return; }
      const r = runChecks(p); ctx.flash("Kiểm tra xong: " + r.counts.red + " đỏ, " + r.counts.yellow + " vàng, " + r.counts.green + " xanh.");
    };
    const xb = $("#ckXlsx", box); if (xb) xb.onclick = () => exportChecksXlsx(p);
    const pb = $("#ckPrint", box); if (pb) pb.onclick = () => printReport(p);
    bindFilter(box);
    return box;
  }
  function step5(p) {
    const box = checkPanel(p, true);
    box.appendChild(el(`<section class="card"><label>Giải trình lỗi đỏ (bắt buộc nếu còn lỗi đỏ mà vẫn chuyển bước)<textarea id="w5Ack" rows="3">${esc(p.checkAck || "")}</textarea></label><button class="btn" id="w5AckSave">Lưu giải trình</button></section>`));
    $("#w5AckSave", box).onclick = () => { p.checkAck = $("#w5Ack", box).value; touch(p); ctx.save(); ctx.render(); };
    return box;
  }
  function step6(p) {
    const st = ctx.getState();
    const opts = (r) => `<option value="">— chưa gán —</option>` + st.priceBook.map((pr) => `<option value="${esc(pr.maHieu)}" ${r.priceCode === pr.maHieu ? "selected" : ""}>${esc(pr.maHieu)} — ${esc(pr.tenCongTac)} (${esc(pr.donVi)})${pr.isSample ? " · mẫu" : ""}</option>`).join("");
    const body = p.qtyRows.slice(0, 400).map((r, i) => { const pr = st.priceBook.find((x) => x.maHieu === r.priceCode); const bad = pr && pr.donVi && r.donVi && pr.donVi.replace("m2", "m²") !== r.donVi.replace("m2", "m²");
      return `<tr class="${!pr ? "lv-yellow" : bad ? "lv-red" : ""}"><td>${i + 1}</td><td>${esc(r.ma)}</td><td>${esc(r.noiDung)}</td><td>${esc(R().workType(r.loaiCongTac).label)}</td><td>${esc(r.donVi)}</td><td class="num">${fmt(r.kl, 3)}</td><td><select data-pc="${r.id}">${opts(r)}</select></td><td>${pr ? esc(pr.donVi) + (bad ? " ≠ ĐV KL" : "") : ""}</td></tr>`; }).join("");
    const box = el(`<div><p class="muted">Áp mã định mức / đơn giá cho từng dòng. Đơn vị KL phải khớp đơn vị giá (QĐ 1041 Mục I.3, I.5). Dòng đỏ: lệch đơn vị; vàng: chưa gán. Mã định mức theo TT 38/2026/TT-BXD do người dùng nhập vào thư viện đơn giá — app không gắn sẵn.</p>
      <div class="toolbar"><button class="btn warn" id="w6Sample">Gán đơn giá mẫu theo từ khóa</button></div>
      <div class="table-wrap"><table><thead><tr><th>STT</th><th>Mã</th><th>Nội dung</th><th>Loại</th><th>ĐV</th><th class="num">KL</th><th>Mã đơn giá</th><th>ĐV giá</th></tr></thead><tbody>${body}</tbody></table></div></div>`);
    $$("select[data-pc]", box).forEach((s) => s.onchange = () => { const r = p.qtyRows.find((x) => x.id === s.dataset.pc); if (r) { r.priceCode = s.value; touch(p); ctx.save(); ctx.render(); } });
    $("#w6Sample", box).onclick = () => {
      const nu = (u) => String(u || "").toLowerCase().replace("m2", "m²").replace("m3", "m³").trim();
      const book = ctx.getState().priceBook;
      let n = 0, skip = 0;
      p.qtyRows.forEach((r) => {
        if (r.priceCode) return;
        const c = C().suggestPriceCode(r); if (!c) return;
        const pr = book.find((x) => x.maHieu === c);
        if (pr && pr.donVi && r.donVi && nu(pr.donVi) !== nu(r.donVi)) { skip++; return; } // không gán khi lệch đơn vị
        r.priceCode = c; n++;
      });
      touch(p); ctx.save();
      ctx.flash("Đã gán " + n + " dòng với đơn giá MẪU — thay bằng giá thực tế." + (skip ? " Bỏ qua " + skip + " dòng vì đơn vị KL khác đơn vị giá — cần chọn tay." : ""));
    };
    return box;
  }
  function step7(p) {
    const est = C().computeEstimate(p, ctx.getState().priceBook);
    const rt = est.rates;
    const vals = { T: est.direct, C: est.cpc, TT: est.ttkxd, GT: est.gianTiep, TL: est.tnctt, GXDTT: est.beforeVat, GTGT: est.vat, GXD: est.afterVat, LT: est.nhaTam, DP: est.duPhong };
    const rows = R().COST_STRUCTURE.map((c) => `<tr><td>${esc(c.label)}</td><td class="small">${esc(c.formula)}</td><td class="num">${C().formatMoney(vals[c.key])}</td><td class="small muted">${esc(c.src)}</td></tr>`).join("") + `<tr class="group"><td colspan="2">TỔNG (chi phí xây dựng sau thuế + nhà tạm + dự phòng)</td><td class="num">${C().formatMoney(est.grand)}</td><td></td></tr>`;
    const box = el(`<div><div class="grid cols-3">
      <label>Chi phí chung C (% × T)<input id="r7cpc" type="number" step="0.01" value="${rt.cpc}"></label>
      <label>CP không xác định KL TT (% × T)<input id="r7tt" type="number" step="0.01" value="${rt.tt}"></label>
      <label>TNCTT (% × (T+GT))<input id="r7tn" type="number" step="0.01" value="${rt.tnctt}"></label>
      <label>Thuế GTGT (%)<input id="r7vat" type="number" step="0.01" value="${rt.vat}"></label>
      <label>Nhà tạm LT (% × GXDTT)<input id="r7lt" type="number" step="0.01" value="${rt.lt}"></label>
      <label>Dự phòng (%)<input id="r7dp" type="number" step="0.01" value="${rt.duPhong}"></label></div>
      <div class="toolbar"><button class="btn" id="r7Preset">Gợi ý theo TT 36 (công trình dân dụng)</button><button class="btn pri" id="r7Save">Lưu tỷ lệ</button>
      <label class="inline"><input type="checkbox" id="r7Ok" ${rt.confirmed ? "checked" : ""}> Tôi đã xác nhận tỷ lệ theo loại & quy mô công trình</label></div>
      <div class="callout">${esc(R().PRESETS_TT36.note)} Gợi ý dùng chi phí xây dựng trước thuế hiện tại (${C().formatMoney(est.beforeVat)}) để chọn khung quy mô — văn bản dùng chi phí trong tổng mức đầu tư được duyệt; hãy kiểm tra lại. Nguồn: <a href="${R().SOURCES.TT36.url}" target="_blank" rel="noopener">TT 36/2026/TT-BXD</a>, Phụ lục III (<a href="${R().SOURCES.TT36.urlAlt}" target="_blank" rel="noopener">PDF</a>).</div>
      <div class="table-wrap"><table><thead><tr><th>Khoản mục</th><th>Cách tính</th><th class="num">Giá trị</th><th>Căn cứ</th></tr></thead><tbody>${rows}</tbody></table></div></div>`);
    const read = () => ({ cpc: C().parseNumber($("#r7cpc", box).value), tt: C().parseNumber($("#r7tt", box).value), tnctt: C().parseNumber($("#r7tn", box).value), vat: C().parseNumber($("#r7vat", box).value), lt: C().parseNumber($("#r7lt", box).value), duPhong: C().parseNumber($("#r7dp", box).value) });
    $("#r7Preset", box).onclick = () => {
      if (p.info.loai && p.info.loai !== "Công trình dân dụng" && !confirm("Gợi ý chỉ trích dòng Công trình dân dụng, khác loại «" + p.info.loai + "». Vẫn điền?")) return;
      const pr = R().presetFor(est.beforeVat / 1e9, "con_lai");
      $("#r7cpc", box).value = pr.cpc; $("#r7tt", box).value = pr.tt; $("#r7tn", box).value = pr.tnctt; $("#r7lt", box).value = pr.lt;
      ctx.flash("Đã điền gợi ý TT 36 — kiểm tra rồi bấm Lưu và xác nhận.");
    };
    $("#r7Save", box).onclick = () => { p.rates = Object.assign(C().defaultRates(), p.rates, read(), { confirmed: $("#r7Ok", box).checked }); touch(p); ctx.save(); ctx.render(); };
    $("#r7Ok", box).onchange = () => { p.rates = Object.assign(C().defaultRates(), p.rates, read(), { confirmed: $("#r7Ok", box).checked }); touch(p); ctx.save(); ctx.render(); };
    return box;
  }
  function step8(p) {
    const others = ctx.getState().projects.filter((x) => x.id !== p.id);
    const box = el(`<div>
      <div class="grid cols-3"><label>Bảng giá tham chiếu (Excel: Mã, Tên, ĐV, Giá)<input type="file" id="w8Ref" accept=".xlsx,.xls,.csv"></label>
      <label>Hoặc công trình cũ<select id="w8Proj"><option value="">— không dùng —</option>${others.map((o) => `<option value="${o.id}" ${p.priceRefProject === o.id ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select></label>
      <label>Ngưỡng ± (%)<input id="w8Tol" type="number" step="0.5" value="${p.checkSettings.priceTolPct}"></label></div>
      <p class="muted">${p.priceRef && p.priceRef.length ? "Đang dùng " + p.priceRef.length + " giá tham chiếu từ «" + esc(p.priceRefName || "") + "»." : "Chưa có bảng giá tham chiếu."} Dòng không có giá đối chiếu được đánh dấu «chưa có giá đối chiếu».</p>
      <div class="toolbar"><button class="btn pri" id="w8Run">Chạy kiểm giá</button></div>
      <section class="card">${issuesTable(p.lastPriceCheck)}</section>
      <label>Giải trình lệch giá (nếu còn dòng đỏ)<textarea id="w8Ack" rows="3">${esc(p.priceAck || "")}</textarea></label><button class="btn" id="w8AckSave">Lưu giải trình</button></div>`);
    $("#w8Ref", box).onchange = (ev) => {
      const f = ev.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const wb = XLSX.read(rd.result, { type: "array" }); const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" }); p.priceRef = root.PiExcel.parseRefPrices(aoa); p.priceRefName = f.name; touch(p); ctx.save(); ctx.flash("Đã nhập " + p.priceRef.length + " giá tham chiếu."); };
      rd.readAsArrayBuffer(f);
    };
    $("#w8Proj", box).onchange = () => { p.priceRefProject = $("#w8Proj", box).value; ctx.save(); };
    $("#w8Run", box).onclick = () => { p.checkSettings.priceTolPct = C().parseNumber($("#w8Tol", box).value); const r = runPriceCheck(p); ctx.flash("Kiểm giá: " + r.counts.red + " đỏ, " + r.counts.yellow + " vàng, " + r.counts.green + " xanh."); };
    $("#w8AckSave", box).onclick = () => { p.priceAck = $("#w8Ack", box).value; touch(p); ctx.save(); ctx.render(); };
    bindFilter(box);
    return box;
  }
  function reviewFields(p, idp) {
    return `<div class="grid cols-3"><label>Người kiểm tra<input id="${idp}Nkt" value="${esc(p.review.nguoiKiemTra)}"></label><label>Ngày duyệt<input id="${idp}Nd" type="date" value="${esc(p.review.ngayDuyet)}"></label><label>Kết luận<select id="${idp}Kl">${["", "Đạt", "Đạt có điều kiện", "Không đạt — chỉnh sửa"].map((x) => `<option ${p.review.ketLuan === x ? "selected" : ""} value="${x}">${x || "— chọn —"}</option>`).join("")}</select></label></div>
      <label>Ghi chú duyệt<textarea id="${idp}Gc" rows="2">${esc(p.review.ghiChu || "")}</textarea></label>`;
  }
  function bindReview(box, p, idp) {
    return () => { Object.assign(p.review, { nguoiKiemTra: $("#" + idp + "Nkt", box).value.trim(), ngayDuyet: $("#" + idp + "Nd", box).value, ketLuan: $("#" + idp + "Kl", box).value, ghiChu: $("#" + idp + "Gc", box).value }); touch(p); ctx.save(); ctx.render(); };
  }
  function step9(p) {
    const box = el(`<div>${reviewFields(p, "w9")}<div class="toolbar"><button class="btn pri" id="w9Save">Lưu duyệt</button>
      <button class="btn" id="w9Bkl">Xuất BKL Excel (có diễn giải)</button><button class="btn" id="w9Est">Xuất dự toán Excel</button><button class="btn" id="w9Chk">Xuất kết quả kiểm tra Excel</button><button class="btn" id="w9Print">In báo cáo / PDF</button></div>
      <p class="muted">Báo cáo hỗ trợ soạn thảo, không thay thế thẩm định / thẩm tra theo quy định.</p></div>`);
    $("#w9Save", box).onclick = bindReview(box, p, "w9");
    $("#w9Bkl", box).onclick = () => exportBklXlsx(p);
    $("#w9Est", box).onclick = () => ctx.exportEstimateXlsx(p);
    $("#w9Chk", box).onclick = () => exportChecksXlsx(p);
    $("#w9Print", box).onclick = () => printReport(p);
    return box;
  }

  function renderWizard() {
    const p = ctx.currentProject();
    if (!p) return ctx.needProject();
    ensure(p); ensureSession(p);
    const status = stepStatus(p);
    const reach = maxReachable(status);
    if (wizStep > reach) wizStep = reach;
    const steps = R().WIZARD_STEPS.map((s) => {
      const done = !status[s.n].length, locked = s.n > reach;
      return `<button class="wstep ${s.n === wizStep ? "on" : ""} ${done ? "done" : locked ? "locked" : "miss"}" data-wstep="${s.n}" ${locked ? "disabled" : ""}><span class="wn">${s.n}</span><span><b>${esc(s.title)}</b><small>${done ? "✓ Xong" : locked ? "Khóa — hoàn thành bước trước" : "Thiếu: " + esc(status[s.n].slice(0, 2).join("; "))}</small></span></button>`;
    }).join("");
    const cur = R().WIZARD_STEPS[wizStep - 1];
    const fns = [null, step1, step2, step3, step4, step5, step6, step7, step8, step9];
    const box = el(`<div class="wizard"><aside class="wsteps no-print">${steps}</aside><section class="card wbody">
      <div class="whead"><h2>Bước ${cur.n}/9 — ${esc(cur.title)}</h2><span class="chip ${status[cur.n].length ? "yellow" : "green"}">${status[cur.n].length ? "Còn thiếu" : "Đã xong"}</span></div>
      <p class="muted">${esc(cur.desc)}</p>
      ${status[cur.n].length ? `<div class="callout bad"><b>Còn thiếu:</b> ${esc(status[cur.n].join("; "))}</div>` : ""}
      <div id="wContent"></div>
      <div class="toolbar wnav"><button class="btn" id="wPrev" ${wizStep === 1 ? "disabled" : ""}>← Bước trước</button><button class="btn pri" id="wNext" ${wizStep === 9 || status[wizStep].length ? "disabled" : ""} title="${status[wizStep].length ? "Hoàn thành bước này trước" : ""}">Bước tiếp →</button></div>
    </section></div>`);
    $("#wContent", box).appendChild(fns[wizStep](p));
    $$("[data-wstep]", box).forEach((b) => b.onclick = () => { wizStep = Number(b.dataset.wstep); ctx.render(); });
    $("#wPrev", box).onclick = () => { wizStep = Math.max(1, wizStep - 1); ctx.render(); };
    $("#wNext", box).onclick = () => { if (!stepStatus(p)[wizStep].length) { wizStep = Math.min(9, wizStep + 1); ctx.render(); } };
    return box;
  }

  function renderChecks() {
    const p = ctx.currentProject();
    if (!p) return ctx.needProject();
    ensure(p); ensureSession(p);
    const box = el(`<div><div class="print-only print-head"><h1>BÁO CÁO KIỂM TRA KHỐI LƯỢNG — ${esc(p.name)}</h1><div>${esc(p.location || "")}</div></div></div>`);
    box.appendChild(checkPanel(p, false));
    const rv = el(`<section class="card"><h3>Người kiểm tra / ngày duyệt</h3>${reviewFields(p, "ck")}<button class="btn pri no-print" id="ckRvSave">Lưu</button></section>`);
    $("#ckRvSave", rv).onclick = bindReview(rv, p, "ck");
    box.appendChild(rv);
    return box;
  }

  function renderLayers() {
    const pf = profile();
    const catOpts = (sel) => Object.entries(A().CATS).map(([k, v]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${esc(v.label)}</option>`).join("");
    const lrows = pf.layers.map((l, i) => `<tr><td><input data-lp="${i}" data-k="pattern" value="${esc(l.pattern)}"></td><td><select data-lp="${i}" data-k="cat">${catOpts(l.cat)}</select></td><td><input data-lp="${i}" data-k="hMm" class="num" value="${esc(l.hMm || "")}" style="width:80px"></td><td><input data-lp="${i}" data-k="note" value="${esc(l.note || "")}"></td><td><button class="btn bad" data-ldel="${i}">Xóa</button></td></tr>`).join("");
    const brows = pf.blocks.map((b, i) => `<tr><td><input data-bp="${i}" data-k="pattern" value="${esc(b.pattern)}"></td><td><select data-bp="${i}" data-k="cat">${catOpts(b.cat)}</select></td><td><select data-bp="${i}" data-k="needCode"><option value="1" ${b.needCode ? "selected" : ""}>Cần mã</option><option value="0" ${!b.needCode ? "selected" : ""}>Không cần</option></select></td><td><input data-bp="${i}" data-k="note" value="${esc(b.note || "")}"></td><td><button class="btn bad" data-bdel="${i}">Xóa</button></td></tr>`).join("");
    const p = ctx.currentProject();
    if (p) ensureSession(ensure(p));
    const a = p && session.projectId === p.id ? session.analysis : null;
    const audit = !a ? `<p class="muted">Tải DXF (tab Khối lượng hoặc bước 2) để kiểm tra hồ sơ.</p>` : `
      <p>DXF «${esc(session.name)}»: ${a.audit.mappedLayers.length} layer đã chuẩn, <b>${a.audit.unmappedLayers.length}</b> layer chưa chuẩn, <b>${a.audit.uncodedBlocks.length}</b> block chưa có mã.</p>
      ${a.audit.unmappedLayers.length ? `<div class="callout bad"><b>Hồ sơ chưa chuẩn</b></div><div class="table-wrap"><table><thead><tr><th>Layer</th><th>Số đối tượng</th><th>Gán loại</th></tr></thead><tbody>${a.audit.unmappedLayers.map((l, i) => `<tr><td>${esc(l.layer)}</td><td class="num">${l.count}</td><td><select data-umap="${i}"><option value="">—</option>${catOpts("")}</select></td></tr>`).join("")}</tbody></table></div><button class="btn pri" id="lyMap">Thêm các layer đã gán vào hồ sơ</button>` : `<div class="callout info">Không có layer chưa chuẩn.</div>`}
      ${a.audit.uncodedBlocks.length ? `<h4>Block chưa có mã</h4><ul>${a.audit.uncodedBlocks.map((b) => `<li><b>${esc(b.name)}</b> ×${b.count} (${esc(b.layers.join(", "))}) — ${esc(b.reason)}</li>`).join("")}</ul>` : ""}`;
    const box = el(`<div><section class="card"><h2>Chuẩn layer — ${esc(pf.name)}</h2>
      <p class="muted">Hồ sơ ánh xạ layer → loại đối tượng. So khớp tên chính xác trước, sau đó mẫu có dấu *. Chiều cao (mm) theo layer, ví dụ tường cao 1250, ghi đè H tầng.</p>
      <div class="toolbar"><button class="btn" id="lyAdd">Thêm layer</button><button class="btn pri" id="lySave">Lưu hồ sơ</button><button class="btn" id="lyExp">Xuất JSON</button><label class="btn">Nhập JSON<input type="file" id="lyImp" accept=".json" hidden></label><button class="btn warn" id="lyReset">Về mặc định</button></div>
      <div class="table-wrap"><table><thead><tr><th>Layer / mẫu</th><th>Loại</th><th>Cao (mm)</th><th>Ghi chú</th><th></th></tr></thead><tbody>${lrows}</tbody></table></div></section>
      <section class="card"><h3>Quy tắc block</h3><div class="toolbar"><button class="btn" id="bkAdd">Thêm block</button></div>
      <div class="table-wrap"><table><thead><tr><th>Tên block / mẫu</th><th>Loại</th><th>Mã loại</th><th>Ghi chú</th><th></th></tr></thead><tbody>${brows}</tbody></table></div>
      <p class="muted">Mã loại đọc từ thuộc tính MA_LOAI, nếu không có thì từ tên block (PI_D1 → D1, PI_F05 → F-05).</p></section>
      <section class="card"><h3>Kiểm tra hồ sơ chưa chuẩn</h3>${audit}</section></div>`);
    const collect = () => {
      $$("[data-lp]", box).forEach((i) => { pf.layers[i.dataset.lp][i.dataset.k] = i.value; });
      $$("[data-bp]", box).forEach((i) => { pf.blocks[i.dataset.bp][i.dataset.k] = i.dataset.k === "needCode" ? i.value === "1" : i.value; });
    };
    const after = () => { ctx.save(); if (p && session.dxf && session.projectId === p.id) { analyze(p); ctx.save(); } ctx.render(); };
    $("#lySave", box).onclick = () => { collect(); after(); ctx.flash("Đã lưu hồ sơ chuẩn layer."); };
    $("#lyAdd", box).onclick = () => { collect(); pf.layers.unshift({ pattern: "", cat: "ignore", hMm: "", note: "" }); after(); };
    $("#bkAdd", box).onclick = () => { collect(); pf.blocks.unshift({ pattern: "", cat: "door", needCode: true, note: "" }); after(); };
    $$("[data-ldel]", box).forEach((b) => b.onclick = () => { collect(); pf.layers.splice(Number(b.dataset.ldel), 1); after(); });
    $$("[data-bdel]", box).forEach((b) => b.onclick = () => { collect(); pf.blocks.splice(Number(b.dataset.bdel), 1); after(); });
    $("#lyReset", box).onclick = () => { if (confirm("Đưa hồ sơ chuẩn layer về mặc định?")) { ctx.getState().archProfile = A().defaultProfile(); after(); } };
    $("#lyExp", box).onclick = () => ctx.downloadBlob(JSON.stringify(pf, null, 2), "pidutoan-chuan-layer.json", "application/json");
    $("#lyImp", box).onchange = (ev) => { const f = ev.target.files[0]; if (!f) return; f.text().then((t) => { const j = JSON.parse(t); if (!Array.isArray(j.layers)) throw new Error("Thiếu layers"); ctx.getState().archProfile = Object.assign({ blocks: [] }, j); after(); }).catch((e) => alert("File không hợp lệ: " + e.message)); };
    const mapBtn = $("#lyMap", box);
    if (mapBtn) mapBtn.onclick = () => { collect(); let n = 0; $$("[data-umap]", box).forEach((s) => { if (s.value) { pf.layers.unshift({ pattern: a.audit.unmappedLayers[s.dataset.umap].layer, cat: s.value, hMm: "", note: "thêm từ kiểm tra hồ sơ" }); n++; } }); after(); ctx.flash("Đã thêm " + n + " layer vào hồ sơ."); };
    return box;
  }

  // ---------- Xuất ----------
  function exportBklXlsx(p) {
    const aoa = [["BẢNG KHỐI LƯỢNG — " + p.name], [p.location || ""], ["Xuất từ PiDự toán · diễn giải theo QĐ 1041/QĐ-BXD Mục I.6 (tham khảo)"], [], ["STT", "Mã hiệu", "Nội dung", "ĐV", "Diễn giải", "Khối lượng"]];
    const src = [["STT", "Mã hiệu", "Nguồn", "Loại công tác", "Bộ môn", "Tầng / hạng mục"]];
    const rows = R().sortRows(p.qtyRows);
    let group = null, stt = 0;
    rows.forEach((r) => {
      const g = R().workType(r.loaiCongTac).label;
      if (g !== group) { group = g; aoa.push(["", "", g.toUpperCase(), "", "", ""]); }
      stt++;
      aoa.push([stt, r.priceCode || r.ma || "", r.noiDung || "", r.donVi || "", r.dienGiai || "", Number(r.kl) || 0]);
      src.push([stt, r.priceCode || r.ma || "", r.nguon || r.source || "", g, r.boMon || "", [r.tang, r.hangMuc].filter(Boolean).join(" · ")]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [6, 16, 50, 8, 70, 14].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "BKL");
    const ws2 = XLSX.utils.aoa_to_sheet(src); ws2["!cols"] = [6, 16, 80, 24, 14, 24].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws2, "Nguon");
    XLSX.writeFile(wb, "pidutoan-BKL-" + safe(p.name) + ".xlsx");
  }
  function exportChecksXlsx(p) {
    const wb = XLSX.utils.book_new();
    const sheet = (res, title) => {
      const aoa = [[title + " — " + p.name], ["Chạy lúc", res ? ctx.fmtDate(res.at) : "chưa chạy"], ["Đỏ", res ? res.counts.red : 0, "Vàng", res ? res.counts.yellow : 0, "Xanh", res ? res.counts.green : 0, "Thông tin", res ? res.counts.info : 0],
        ["Người kiểm tra", p.review.nguoiKiemTra || "", "Ngày duyệt", p.review.ngayDuyet || "", "Kết luận", p.review.ketLuan || ""], [], ["#", "Mức", "Nhóm", "Hạng mục", "Lý do", "Hướng xử lý"]];
      (res ? res.issues : []).forEach((i, n) => aoa.push([n + 1, LEVEL[i.level], i.group, i.item, i.reason, i.action || ""]));
      const ws = XLSX.utils.aoa_to_sheet(aoa); ws["!cols"] = [5, 10, 18, 28, 80, 50].map((w) => ({ wch: w })); return ws;
    };
    XLSX.utils.book_append_sheet(wb, sheet(p.lastCheck, "KIỂM TRA CHÉO"), "KiemTra");
    XLSX.utils.book_append_sheet(wb, sheet(p.lastPriceCheck, "KIỂM GIÁ"), "KiemGia");
    XLSX.writeFile(wb, "pidutoan-kiemtra-" + safe(p.name) + ".xlsx");
  }
  function printReport(p) { issueFilter = "all"; ctx.setView("checks"); setTimeout(() => window.print(), 250); }
  const safe = (s) => String(s || "dutoan").replace(/[^\p{L}\p{N}-]+/gu, "_").slice(0, 40);

  root.PiFlow = {
    init(c) { ctx = c; }, renderWizard, renderChecks, renderLayers, onDxfLoaded, ensureSession, runChecks, runPriceCheck, stepStatus, exportBklXlsx, exportChecksXlsx,
    get session() { return session; }, setStep(n) { wizStep = n; }, ensure,
  };
})(typeof window !== "undefined" ? window : globalThis);
