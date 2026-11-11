/* PDF / ảnh: lưu tài liệu tham chiếu, đọc bảng KL từ lớp chữ PDF, đo trên màn hình (hiệu chỉnh, dài, diện tích, đếm). */
(function () {
  const PDFJS_VER = "3.11.174";
  const C = window.PiCore;
  let ctx = null; // {getProject, save, render, flash}

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function fmt(n, d) { return C.formatVN(n, d === undefined ? 2 : d); }
  function sizeText(b) { return b > 1048576 ? fmt(b / 1048576, 1) + " MB" : fmt(b / 1024, 0) + " KB"; }
  function isPdf(meta) { return /pdf/i.test(meta.type) || /\.pdf$/i.test(meta.name); }

  function init(c) {
    ctx = c;
    if (window.pdfjsLib) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@" + PDFJS_VER + "/build/pdf.worker.min.js";
    }
  }

  function needPdfJs() {
    if (!window.pdfjsLib) throw new Error("Chưa tải được thư viện pdf.js (kiểm tra kết nối mạng).");
    return window.pdfjsLib;
  }

  async function loadPdf(id) {
    const blob = await PiDocs.getBlob(id);
    if (!blob) throw new Error("Không tìm thấy file trong bộ nhớ trình duyệt.");
    const data = new Uint8Array(await blob.arrayBuffer());
    return needPdfJs().getDocument({ data }).promise;
  }

  /* ---------- Tải file ---------- */
  async function handleFile(file) {
    const p = ctx.getProject();
    if (!p || !file) return;
    const okType = /\.(pdf|jpe?g|png|webp)$/i.test(file.name) || /^(application\/pdf|image\/(jpeg|png|webp))$/.test(file.type);
    if (!okType) { alert("Chỉ nhận PDF, JPG, PNG, WEBP."); return; }
    const meta = {
      id: C.uid("doc"), projectId: p.id, name: file.name, type: file.type || (/\.pdf$/i.test(file.name) ? "application/pdf" : "image/*"),
      size: file.size, addedAt: new Date().toISOString(), pages: 1, calib: {}, measures: [],
    };
    try {
      if (isPdf(meta)) {
        const pdf = await needPdfJs().getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        meta.pages = pdf.numPages;
      }
      await PiDocs.addDoc(meta, file);
    } catch (e) {
      console.error(e);
      alert("Không lưu / mở được file: " + e.message);
      return;
    }
    refreshList();
    if (isPdf(meta)) openPdfMenu(meta); else openViewer(meta, 1);
  }

  /* ---------- Danh sách tài liệu ---------- */
  function docListCard() {
    return el(`<section class="card" id="docCard">
      <h3>Tài liệu tham chiếu (PDF / ảnh)</h3>
      <p class="muted">File lưu trong bộ nhớ trình duyệt (IndexedDB) của máy này, gắn với công trình đang mở. Không gửi lên máy chủ.</p>
      <div id="docList"><p class="muted">Đang tải…</p></div>
    </section>`);
  }

  async function refreshList() {
    const box = document.getElementById("docList");
    const p = ctx.getProject();
    if (!box || !p) return;
    let docs = [];
    try { docs = await PiDocs.listDocs(p.id); } catch (e) { box.innerHTML = `<p class="callout bad">Không đọc được IndexedDB: ${esc(e.message)}</p>`; return; }
    if (!docs.length) { box.innerHTML = `<p class="muted">Chưa có tài liệu. Bấm «Tải PDF / Ảnh».</p>`; return; }
    box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Tên file</th><th>Loại</th><th class="num">Trang</th><th class="num">Dung lượng</th><th class="num">Phép đo</th><th></th></tr></thead>
      <tbody>${docs.map((d) => `<tr>
        <td>${esc(d.name)}</td><td>${isPdf(d) ? "PDF" : "Ảnh"}</td><td class="num">${d.pages || 1}</td>
        <td class="num">${sizeText(d.size || 0)}</td><td class="num">${(d.measures || []).length}</td>
        <td class="row-actions">
          <button class="btn pri" data-doc-view="${d.id}">Xem / đo</button>
          ${isPdf(d) ? `<button class="btn" data-doc-table="${d.id}">Đọc bảng KL</button>` : ""}
          <button class="btn" data-doc-open="${d.id}">File gốc</button>
          <button class="btn bad" data-doc-del="${d.id}">Xóa</button>
        </td></tr>`).join("")}</tbody></table></div>`;
    const byId = (id) => docs.find((d) => d.id === id);
    box.querySelectorAll("[data-doc-view]").forEach((b) => b.onclick = () => {
      const d = byId(b.dataset.docView);
      if (isPdf(d) && d.pages > 1) openPdfMenu(d); else openViewer(d, 1);
    });
    box.querySelectorAll("[data-doc-table]").forEach((b) => b.onclick = () => openPdfMenu(byId(b.dataset.docTable)));
    box.querySelectorAll("[data-doc-open]").forEach((b) => b.onclick = async () => {
      const blob = await PiDocs.getBlob(b.dataset.docOpen);
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    });
    box.querySelectorAll("[data-doc-del]").forEach((b) => b.onclick = async () => {
      const d = byId(b.dataset.docDel);
      if (!confirm("Xóa tài liệu «" + d.name + "» và các phép đo trên nó? Các dòng KL đã thêm vẫn giữ.")) return;
      await PiDocs.deleteDoc(d.id);
      refreshList();
    });
  }

  /* ---------- Modal chung ---------- */
  function openModal(inner, cls) {
    closeModal();
    const m = el(`<div class="modal ${cls || ""}" id="piModal"><div class="sheet">${inner}</div></div>`);
    document.body.appendChild(m);
    document.body.classList.add("modal-open");
    m.querySelectorAll("[data-close]").forEach((b) => b.onclick = closeModal);
    return m;
  }
  function closeModal() {
    const m = document.getElementById("piModal");
    if (m) m.remove();
    document.body.classList.remove("modal-open");
    if (viewer) { window.removeEventListener("resize", viewer.onResize); viewer = null; }
    if (ctx) refreshList();
  }

  function pageOptions(n, sel) {
    let s = "";
    for (let i = 1; i <= n; i++) s += `<option value="${i}" ${i === sel ? "selected" : ""}>Trang ${i}</option>`;
    return s;
  }

  /* ---------- Menu PDF: chọn trang, đọc bảng hoặc đo ---------- */
  function openPdfMenu(meta) {
    const m = openModal(`
      <div class="sheet-head"><h2>${esc(meta.name)}</h2><button class="btn" data-close>Đóng</button></div>
      <p class="muted">PDF ${meta.pages} trang.</p>
      <div class="toolbar">
        <label>Trang<select id="pmPage">${pageOptions(meta.pages, 1)}</select></label>
      </div>
      <div class="toolbar">
        <button class="btn pri" id="pmMeasure">Đo trên trang này</button>
        <button class="btn" id="pmTable">Đọc bảng KL — trang này</button>
        ${meta.pages > 1 ? `<button class="btn" id="pmTableAll">Đọc bảng KL — tất cả trang</button>` : ""}
      </div>
      <div class="callout info">«Đọc bảng KL» lấy chữ có sẵn trong PDF (PDF xuất từ CAD / Excel). PDF scan không có lớp chữ — khi đó hãy đo trên bản vẽ.</div>
      <div id="pmMsg"></div>`);
    const page = () => Number(m.querySelector("#pmPage").value) || 1;
    m.querySelector("#pmMeasure").onclick = () => openViewer(meta, page());
    m.querySelector("#pmTable").onclick = () => runTableImport(meta, [page()]);
    const all = m.querySelector("#pmTableAll");
    if (all) all.onclick = () => runTableImport(meta, Array.from({ length: meta.pages }, (_, i) => i + 1));
  }

  async function runTableImport(meta, pages) {
    const msg = document.getElementById("pmMsg");
    if (msg) msg.innerHTML = `<p class="muted">Đang đọc lớp chữ…</p>`;
    try {
      const pdf = await loadPdf(meta.id);
      const pageData = [];
      for (const n of pages) {
        const pg = await pdf.getPage(n);
        const tc = await pg.getTextContent();
        pageData.push({
          page: n,
          items: tc.items.map((i) => ({ str: i.str, x: i.transform[4], y: i.transform[5], w: i.width, h: Math.hypot(i.transform[2], i.transform[3]) || i.height })),
        });
      }
      const res = PiPdfTable.extract(pageData);
      if (res.pagesWithText === 0) {
        if (msg) msg.innerHTML = `<div class="callout bad" id="scanNote"><b>PDF scan, cần đo trên bản vẽ.</b> File không có lớp chữ nên không đọc được số. Bấm «Đo trên trang này» để hiệu chỉnh tỷ lệ và đo.</div>`;
        return;
      }
      if (!res.rows.length) {
        if (msg) msg.innerHTML = `<div class="callout" id="noRowsNote">Có lớp chữ nhưng không thấy bảng có cột Nội dung / ĐV / KL hoặc dòng «… đơn vị số». Không tự điền số — hãy nhập tay hoặc đo trên bản vẽ.</div>`;
        return;
      }
      openTablePreview(meta, res.rows);
    } catch (e) {
      console.error(e);
      if (msg) msg.innerHTML = `<div class="callout bad">Lỗi đọc PDF: ${esc(e.message)}</div>`;
    }
  }

  function openTablePreview(meta, rows) {
    const m = openModal(`
      <div class="sheet-head"><h2>Xem trước bảng KL từ PDF</h2><button class="btn" data-close>Hủy</button></div>
      <p class="muted">${esc(meta.name)} — tìm thấy ${rows.length} dòng. Kiểm tra từng dòng, bỏ chọn dòng sai, sửa nếu cần rồi bấm Thêm. Cột «Chữ gốc» là nguyên văn trong PDF.</p>
      <div class="toolbar">
        <label>Hạng mục / tầng<input id="tpHang" value="PDF: ${esc(meta.name.replace(/\.pdf$/i, ""))}"></label>
        <button class="btn" id="tpAll">Chọn tất cả</button><button class="btn" id="tpNone">Bỏ chọn tất cả</button>
      </div>
      <div class="table-wrap" style="max-height:52vh"><table id="tpTable">
        <thead><tr><th></th><th>Mã</th><th>Nội dung</th><th>ĐV</th><th class="num">KL</th><th class="num">Trang</th><th>Chữ gốc</th></tr></thead>
        <tbody>${rows.map((r, i) => `<tr data-i="${i}">
          <td><input type="checkbox" class="tpChk" checked></td>
          <td><input class="tpMa" value="${esc(r.ma)}" style="width:90px"></td>
          <td><input class="tpNd" value="${esc(r.noiDung)}"></td>
          <td><input class="tpDv" value="${esc(r.donVi)}" style="width:60px"></td>
          <td><input class="tpKl num" value="${esc(r.klText)}" style="width:90px">${r.ambiguous ? `<div class="warn-text">Kiểm tra dấu chấm: đọc là ${fmt(r.kl)}</div>` : ""}</td>
          <td class="num">${r.page}</td>
          <td class="muted small">${esc(r.raw)}</td></tr>`).join("")}</tbody></table></div>
      <div class="toolbar"><button class="btn pri" id="tpAdd">Thêm dòng đã chọn</button><span class="muted" id="tpCount"></span></div>`, "wide");
    const count = () => { m.querySelector("#tpCount").textContent = m.querySelectorAll(".tpChk:checked").length + " / " + rows.length + " dòng được chọn"; };
    m.querySelectorAll(".tpChk").forEach((c) => c.onchange = count);
    m.querySelector("#tpAll").onclick = () => { m.querySelectorAll(".tpChk").forEach((c) => c.checked = true); count(); };
    m.querySelector("#tpNone").onclick = () => { m.querySelectorAll(".tpChk").forEach((c) => c.checked = false); count(); };
    count();
    m.querySelector("#tpAdd").onclick = () => {
      const p = ctx.getProject();
      const hang = m.querySelector("#tpHang").value.trim();
      let n = 0;
      m.querySelectorAll("#tpTable tbody tr").forEach((tr) => {
        if (!tr.querySelector(".tpChk").checked) return;
        const r = rows[Number(tr.dataset.i)];
        const klText = tr.querySelector(".tpKl").value;
        const parsed = PiPdfTable.parseNum(klText);
        const row = {
          id: C.uid("kl"), ma: tr.querySelector(".tpMa").value.trim(), noiDung: tr.querySelector(".tpNd").value.trim(),
          viTri: r.viTri || "", kichThuoc: r.kichThuoc || "", donVi: tr.querySelector(".tpDv").value.trim(),
          kl: parsed ? parsed.value : C.parseNumber(klText), ghiChu: "Đọc từ lớp chữ PDF: " + r.raw,
          hangMuc: hang, priceCode: "", source: meta.name + " · tr." + r.page,
        };
        row.priceCode = C.suggestPriceCode(row);
        p.qtyRows.push(row);
        n++;
      });
      p.updatedAt = new Date().toISOString();
      ctx.save();
      closeModal();
      ctx.flash("Đã thêm " + n + " dòng từ PDF «" + meta.name + "». Hãy đối chiếu lại với bản gốc.");
    };
  }

  /* ---------- Trình đo ---------- */
  let viewer = null;
  const MODES = { pan: "Kéo / thu phóng", calib: "Hiệu chỉnh tỷ lệ", length: "Đo dài", area: "Đo diện tích", count: "Đếm" };

  async function openViewer(meta, pageNum) {
    const m = openModal(`
      <div class="viewer">
        <div class="vbar">
          <b class="vname">${esc(meta.name)}</b>
          ${isPdf(meta) && meta.pages > 1 ? `<select id="vPage">${pageOptions(meta.pages, pageNum)}</select>` : ""}
          <span class="seg" id="vModes">${Object.keys(MODES).map((k) => `<button class="btn" data-mode="${k}">${MODES[k]}</button>`).join("")}</span>
          <button class="btn" id="vFinish">Xong hình</button>
          <button class="btn" id="vUndo">Hoàn tác</button>
          <button class="btn" id="vFit">Vừa khung</button>
          <button class="btn" id="vZin">+</button><button class="btn" id="vZout">−</button>
          <button class="btn" data-close>Đóng</button>
        </div>
        <div id="vCalibWarn" class="callout bad vwarn">Chưa hiệu chỉnh tỷ lệ — số đo dài/diện tích chưa có giá trị. Bấm «Hiệu chỉnh tỷ lệ», chọn 2 điểm có kích thước đã biết (ví dụ hai đầu một đường dim) rồi nhập chiều dài thực (mm).</div>
        <div id="vCalibBox" class="vcalib hidden">
          <label>Chiều dài thực giữa 2 điểm (mm)<input id="vCalibMm" type="number" inputmode="decimal" min="0" step="any" placeholder="vd 10000"></label>
          <button class="btn pri" id="vCalibOk">Lưu tỷ lệ</button><button class="btn" id="vCalibCancel">Bỏ</button>
        </div>
        <div class="vbody">
          <div class="vstage" id="vStage"><canvas id="vCanvas"></canvas><div class="vhint" id="vHint"></div></div>
          <aside class="vside">
            <div id="vScale" class="muted"></div>
            <h3>Phép đo trên trang</h3>
            <div id="vList"></div>
            <label>Hạng mục / tầng cho các dòng<input id="vHang" value="Đo: ${esc(meta.name.replace(/\.[a-z0-9]+$/i, ""))}"></label>
            <button class="btn ok" id="vAdd">Thêm phép đo vào bảng KL</button>
          </aside>
        </div>
      </div>`, "full");
    viewer = {
      meta, page: pageNum, mode: "pan", base: null, rs: 1, z: 1, tx: 0, ty: 0, cur: [], calibPts: null, hover: null,
      canvas: m.querySelector("#vCanvas"), stage: m.querySelector("#vStage"), m,
    };
    const v = viewer;
    v.onResize = () => { sizeCanvas(); draw(); };
    window.addEventListener("resize", v.onResize);
    m.querySelectorAll("[data-mode]").forEach((b) => b.onclick = () => setMode(b.dataset.mode));
    m.querySelector("#vFinish").onclick = finishShape;
    m.querySelector("#vUndo").onclick = undo;
    m.querySelector("#vFit").onclick = () => { fit(); draw(); };
    m.querySelector("#vZin").onclick = () => zoomAt(1.25);
    m.querySelector("#vZout").onclick = () => zoomAt(0.8);
    m.querySelector("#vCalibOk").onclick = saveCalib;
    m.querySelector("#vCalibCancel").onclick = () => { v.calibPts = null; showCalibBox(false); draw(); };
    m.querySelector("#vAdd").onclick = addMeasuresToQty;
    const ps = m.querySelector("#vPage");
    if (ps) ps.onchange = () => loadPage(Number(ps.value));
    bindPointer();
    setMode("pan");
    await loadPage(pageNum);
  }

  async function loadPage(n) {
    const v = viewer;
    v.page = n; v.cur = []; v.calibPts = null; showCalibBox(false);
    const hint = v.m.querySelector("#vHint");
    hint.textContent = "Đang tải…";
    try {
      if (isPdf(v.meta)) {
        if (!v.pdf) v.pdf = await loadPdf(v.meta.id);
        const page = await v.pdf.getPage(n);
        const vp1 = page.getViewport({ scale: 1 });
        const rs = Math.min(4, 2600 / Math.max(vp1.width, vp1.height));
        const vp = page.getViewport({ scale: rs });
        const cv = document.createElement("canvas");
        cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
        const g = cv.getContext("2d");
        g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        v.base = cv; v.rs = rs; v.unitLabel = "pt";
      } else {
        const blob = await PiDocs.getBlob(v.meta.id);
        const url = URL.createObjectURL(blob);
        const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("Không mở được ảnh")); im.src = url; });
        v.base = img; v.rs = 1; v.unitLabel = "px";
      }
      hint.textContent = "";
    } catch (e) {
      console.error(e);
      hint.textContent = "Lỗi: " + e.message;
      return;
    }
    sizeCanvas(); fit(); refreshSide(); draw();
  }

  function baseW() { return viewer.base.naturalWidth || viewer.base.width; }
  function baseH() { return viewer.base.naturalHeight || viewer.base.height; }

  function sizeCanvas() {
    const v = viewer; if (!v) return;
    const dpr = window.devicePixelRatio || 1;
    const r = v.stage.getBoundingClientRect();
    v.cw = Math.max(50, r.width); v.ch = Math.max(50, r.height);
    v.canvas.width = Math.round(v.cw * dpr); v.canvas.height = Math.round(v.ch * dpr);
    v.canvas.style.width = v.cw + "px"; v.canvas.style.height = v.ch + "px";
    v.dpr = dpr;
  }
  function fit() {
    const v = viewer; if (!v || !v.base) return;
    v.z = Math.min(v.cw / baseW(), v.ch / baseH()) * 0.96;
    v.tx = (v.cw - baseW() * v.z) / 2; v.ty = (v.ch - baseH() * v.z) / 2;
  }
  function zoomAt(f, sx, sy) {
    const v = viewer; if (!v) return;
    if (sx === undefined) { sx = v.cw / 2; sy = v.ch / 2; }
    const nz = Math.min(40, Math.max(0.02, v.z * f));
    const k = nz / v.z;
    v.tx = sx - (sx - v.tx) * k; v.ty = sy - (sy - v.ty) * k; v.z = nz;
    draw();
  }
  // doc units (pt cho PDF, px cho ảnh) <-> màn hình (CSS px trong canvas)
  function toScreen(u, w) { const v = viewer; const k = v.rs * v.z; return [u * k + v.tx, w * k + v.ty]; }
  function toDoc(sx, sy) { const v = viewer; const k = v.rs * v.z; return [(sx - v.tx) / k, (sy - v.ty) / k]; }

  function upm() { const v = viewer; return (v.meta.calib || {})[v.page] || null; } // doc units per mm

  function setMode(mode) {
    const v = viewer;
    if (v.cur.length && mode !== v.mode) finishShape();
    v.mode = mode; v.cur = [];
    v.m.querySelectorAll("[data-mode]").forEach((b) => b.classList.toggle("on", b.dataset.mode === mode));
    const hints = {
      pan: "Kéo để di chuyển, cuộn chuột / chụm 2 ngón để thu phóng.",
      calib: "Chọn 2 điểm có kích thước đã biết.",
      length: "Chạm các điểm của đường đo, bấm «Xong hình» (hoặc nháy đúp) để kết thúc.",
      area: "Chạm các đỉnh của vùng, bấm «Xong hình» để khép vùng.",
      count: "Chạm vào từng đối tượng để đếm, bấm «Xong hình» để lưu nhóm.",
    };
    v.m.querySelector("#vHint").textContent = hints[mode];
    v.canvas.style.cursor = mode === "pan" ? "grab" : "crosshair";
    draw();
  }

  function showCalibBox(on) {
    const v = viewer; if (!v) return;
    v.m.querySelector("#vCalibBox").classList.toggle("hidden", !on);
    if (on) setTimeout(() => v.m.querySelector("#vCalibMm").focus(), 30);
  }

  function addPoint(u, w) {
    const v = viewer;
    if (v.mode === "calib") {
      v.calibPts = v.calibPts && v.calibPts.length === 1 ? [v.calibPts[0], [u, w]] : [[u, w]];
      if (v.calibPts.length === 2) showCalibBox(true);
    } else if (v.mode === "length" || v.mode === "area" || v.mode === "count") {
      v.cur.push([u, w]);
    }
    draw();
  }

  async function persist() {
    try { await PiDocs.updateDoc(viewer.meta); } catch (e) { console.error(e); }
  }

  function saveCalib() {
    const v = viewer;
    const mm = Number(String(v.m.querySelector("#vCalibMm").value).replace(",", "."));
    if (!v.calibPts || v.calibPts.length !== 2) return;
    const d = dist(v.calibPts[0], v.calibPts[1]);
    if (!(mm > 0) || !(d > 0)) { alert("Nhập chiều dài thực > 0 (mm)."); return; }
    v.meta.calib = v.meta.calib || {};
    v.meta.calib[v.page] = d / mm;
    v.meta.calibInfo = v.meta.calibInfo || {};
    v.meta.calibInfo[v.page] = { mm, pts: v.calibPts };
    v.calibPts = null;
    showCalibBox(false);
    persist(); refreshSide(); setMode("length");
  }

  function finishShape() {
    const v = viewer;
    const need = { length: 2, area: 3, count: 1 }[v.mode];
    if (!need) return;
    if (v.cur.length < need) { if (v.cur.length) alert("Cần ít nhất " + need + " điểm."); return; }
    const defaults = { length: "Chiều dài đo", area: "Diện tích đo", count: "Số lượng đếm" };
    const no = (v.meta.measures || []).filter((x) => x.page === v.page && x.type === v.mode).length + 1;
    v.meta.measures = v.meta.measures || [];
    v.meta.measures.push({ id: C.uid("ms"), type: v.mode, page: v.page, pts: v.cur.slice(), name: defaults[v.mode] + " " + no });
    v.cur = [];
    persist(); refreshSide(); draw();
  }

  function undo() {
    const v = viewer;
    if (v.cur.length) v.cur.pop();
    else if (v.calibPts) { v.calibPts = null; showCalibBox(false); }
    else {
      const list = v.meta.measures || [];
      for (let i = list.length - 1; i >= 0; i--) if (list[i].page === v.page) { list.splice(i, 1); break; }
      persist(); refreshSide();
    }
    draw();
  }

  function dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function polyLen(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }
  function polyArea(pts) { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s) / 2; }

  /** Giá trị thực: {value, unit} hoặc value=null khi chưa hiệu chỉnh. */
  function measureValue(ms) {
    const k = (viewer.meta.calib || {})[ms.page];
    if (ms.type === "count") return { value: ms.pts.length, unit: "cái" };
    if (!k) return { value: null, unit: ms.type === "area" ? "m²" : "m" };
    if (ms.type === "length") return { value: polyLen(ms.pts) / k / 1000, unit: "m" };
    return { value: polyArea(ms.pts) / (k * k) / 1e6, unit: "m²" };
  }

  function refreshSide() {
    const v = viewer; if (!v) return;
    const k = upm();
    v.m.querySelector("#vCalibWarn").classList.toggle("hidden", !!k);
    const info = (v.meta.calibInfo || {})[v.page];
    v.m.querySelector("#vScale").innerHTML = k
      ? `Tỷ lệ trang ${v.page}: 1 m thực = ${fmt(k * 1000, 1)} ${v.unitLabel || ""}${info ? ` (đặt theo đoạn ${fmt(info.mm, 0)} mm)` : ""}`
      : `<span class="warn-text">Trang ${v.page}: chưa hiệu chỉnh tỷ lệ.</span>`;
    const list = (v.meta.measures || []).filter((x) => x.page === v.page);
    const box = v.m.querySelector("#vList");
    if (!list.length) { box.innerHTML = `<p class="muted">Chưa có phép đo.</p>`; return; }
    const typeName = { length: "Dài", area: "Diện tích", count: "Đếm" };
    box.innerHTML = list.map((ms) => {
      const val = measureValue(ms);
      return `<div class="mrow" data-ms="${ms.id}">
        <div class="mtop"><span class="tag">${typeName[ms.type]}</span>
          <b class="mval">${val.value === null ? "— chưa hiệu chỉnh" : fmt(val.value, ms.type === "count" ? 0 : 2) + " " + val.unit}</b>
          <button class="btn bad sm" data-ms-del="${ms.id}">Xóa</button></div>
        <input class="mname" data-ms-name="${ms.id}" value="${esc(ms.name)}" placeholder="Tên công tác">
      </div>`;
    }).join("");
    box.querySelectorAll("[data-ms-del]").forEach((b) => b.onclick = () => {
      v.meta.measures = v.meta.measures.filter((x) => x.id !== b.dataset.msDel);
      persist(); refreshSide(); draw();
    });
    box.querySelectorAll("[data-ms-name]").forEach((inp) => inp.onchange = () => {
      const ms = v.meta.measures.find((x) => x.id === inp.dataset.msName);
      if (ms) { ms.name = inp.value; persist(); }
    });
  }

  function addMeasuresToQty() {
    const v = viewer;
    const p = ctx.getProject();
    const list = (v.meta.measures || []).filter((x) => x.page === v.page);
    if (!list.length) { alert("Chưa có phép đo trên trang này."); return; }
    const hang = v.m.querySelector("#vHang").value.trim();
    let n = 0, skipped = 0;
    list.forEach((ms) => {
      const val = measureValue(ms);
      if (val.value === null) { skipped++; return; }
      const k = (v.meta.calib || {})[ms.page];
      const row = {
        id: C.uid("kl"), ma: "", noiDung: ms.name, viTri: "", kichThuoc: "", donVi: val.unit,
        kl: Math.round(val.value * 1000) / 1000,
        ghiChu: ms.type === "count" ? "Đếm trên bản vẽ (" + ms.pts.length + " điểm)" : "Đo trên bản vẽ, tỷ lệ 1 m = " + fmt(k * 1000, 1) + " " + v.unitLabel,
        hangMuc: hang, priceCode: "", source: v.meta.name + (isPdf(v.meta) ? " · tr." + ms.page : ""),
      };
      row.priceCode = C.suggestPriceCode(row);
      p.qtyRows.push(row);
      n++;
    });
    p.updatedAt = new Date().toISOString();
    ctx.save();
    alert("Đã thêm " + n + " dòng vào bảng KL." + (skipped ? " Bỏ qua " + skipped + " phép đo chưa hiệu chỉnh tỷ lệ." : ""));
  }

  function bindPointer() {
    const v = viewer, cv = v.canvas;
    const pts = new Map();
    let drag = null, pinch = null;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      pts.set(e.pointerId, [x, y]);
      if (pts.size === 1) drag = { sx: x, sy: y, lx: x, ly: y, moved: false };
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: dist(a, b), z: v.z, tx: v.tx, ty: v.ty, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
        if (drag) drag.moved = true;
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const [x, y] = local(e);
      if (!pts.has(e.pointerId)) { v.hover = [x, y]; if (v.cur.length || (v.calibPts && v.calibPts.length === 1)) draw(); return; }
      pts.set(e.pointerId, [x, y]);
      if (pinch && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const nz = Math.min(40, Math.max(0.02, pinch.z * dist(a, b) / (pinch.d || 1)));
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        const k = nz / pinch.z;
        v.z = nz; v.tx = mx - (pinch.mx - pinch.tx) * k; v.ty = my - (pinch.my - pinch.ty) * k;
        draw(); return;
      }
      if (drag) {
        if (Math.hypot(x - drag.sx, y - drag.sy) > 6) drag.moved = true;
        if (drag.moved) { v.tx += x - drag.lx; v.ty += y - drag.ly; draw(); }
        drag.lx = x; drag.ly = y;
      }
    });
    const up = (e) => {
      const [x, y] = local(e);
      const wasTap = drag && !drag.moved && !pinch && pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        if (wasTap && v.mode !== "pan") { const [u, w] = toDoc(x, y); addPoint(u, w); }
        drag = null;
      }
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); drag = null; pinch = null; });
    cv.addEventListener("pointerleave", () => { v.hover = null; draw(); });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const [x, y] = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, x, y); }, { passive: false });
    cv.addEventListener("dblclick", (e) => { e.preventDefault(); finishShape(); });
  }

  function draw() {
    const v = viewer; if (!v || !v.base || !v.cw) return;
    const g = v.canvas.getContext("2d");
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    g.fillStyle = "#2b2f36"; g.fillRect(0, 0, v.cw, v.ch);
    g.imageSmoothingEnabled = true;
    g.drawImage(v.base, v.tx, v.ty, baseW() * v.z, baseH() * v.z);
    const S = (p) => toScreen(p[0], p[1]);
    const label = (txt, x, y, color) => {
      g.font = "bold 13px Arial"; const w = g.measureText(txt).width + 8;
      g.fillStyle = "rgba(0,0,0,.75)"; g.fillRect(x + 6, y - 18, w, 18);
      g.fillStyle = color; g.fillText(txt, x + 10, y - 5);
    };
    const path = (pts, close) => { g.beginPath(); pts.forEach((p, i) => { const [x, y] = S(p); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (close) g.closePath(); };
    const dots = (pts, color) => { g.fillStyle = color; pts.forEach((p) => { const [x, y] = S(p); g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }); };
    const colors = { length: "#1e90ff", area: "#16a34a", count: "#f97316", calib: "#d946ef" };
    (v.meta.measures || []).filter((x) => x.page === v.page).forEach((ms) => {
      const col = colors[ms.type], val = measureValue(ms);
      const txt = ms.name + ": " + (val.value === null ? "?" : fmt(val.value, ms.type === "count" ? 0 : 2) + " " + val.unit);
      g.lineWidth = 2.5; g.strokeStyle = col;
      if (ms.type === "count") {
        ms.pts.forEach((p, i) => { const [x, y] = S(p); g.fillStyle = col; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.fillStyle = "#fff"; g.font = "bold 11px Arial"; g.textAlign = "center"; g.fillText(String(i + 1), x, y + 4); g.textAlign = "left"; });
        const [x, y] = S(ms.pts[0]); label(txt, x + 8, y, col);
      } else {
        path(ms.pts, ms.type === "area");
        if (ms.type === "area") { g.fillStyle = "rgba(22,163,74,.22)"; g.fill(); }
        g.stroke(); dots(ms.pts, col);
        const [x, y] = S(ms.pts[0]); label(txt, x, y, col);
      }
    });
    const info = (v.meta.calibInfo || {})[v.page];
    if (info && info.pts) { g.setLineDash([6, 4]); g.strokeStyle = colors.calib; g.lineWidth = 2; path(info.pts); g.stroke(); g.setLineDash([]); dots(info.pts, colors.calib); }
    // đang vẽ
    const live = v.mode === "calib" ? (v.calibPts || []) : v.cur;
    if (live.length) {
      const col = colors[v.mode] || "#fff";
      g.strokeStyle = col; g.lineWidth = 2.5;
      if (v.mode === "count") live.forEach((p) => { const [x, y] = S(p); g.fillStyle = col; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); });
      else {
        path(live, false);
        if (v.hover && !(v.mode === "calib" && live.length === 2)) { const [hx, hy] = v.hover; g.lineTo(hx, hy); }
        g.stroke(); dots(live, col);
      }
    }
  }

  /* Gợi ý kiểm thử tự động */
  window.PiMedia = {
    init, handleFile, docListCard, refreshList, closeModal,
    _debug: {
      viewer: () => viewer,
      docToClient(u, w) { const [x, y] = toScreen(u, w); const r = viewer.canvas.getBoundingClientRect(); return [x + r.left, y + r.top]; },
      values() { return (viewer.meta.measures || []).map((ms) => ({ type: ms.type, page: ms.page, ...measureValue(ms) })); },
    },
  };
})();
