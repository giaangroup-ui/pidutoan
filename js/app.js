(function () {
  const C = window.PiCore;
  let state = C.loadState();
  let view = "projects";
  let dxfSession = null;
  let dxfUnit = "mm";
  let flash = "";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  persistTheme();

  function persistTheme() {
    document.documentElement.setAttribute("data-theme", state.theme || "dark");
  }

  function save() {
    C.saveState(state);
  }

  function currentProject() {
    return state.projects.find((p) => p.id === state.currentProjectId) || null;
  }

  function setFlash(msg) {
    flash = msg;
    render();
    if (msg) setTimeout(() => { if (flash === msg) { flash = ""; render(); } }, 4000);
  }

  function projectSelectHtml() {
    const opts = state.projects.map((p) =>
      `<option value="${p.id}" ${p.id === state.currentProjectId ? "selected" : ""}>${escapeHtml(p.name)}</option>`
    ).join("");
    return `<select id="projectPick"><option value="">— Chọn công trình —</option>${opts}</select>`;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function render() {
    persistTheme();
    $("#themeBtn").textContent = (state.theme || "dark") === "dark" ? "Nền sáng" : "Nền tối";
    $("#projectSlot").innerHTML = projectSelectHtml();
    document.querySelectorAll("nav.tabs button").forEach((b) => {
      b.classList.toggle("on", b.dataset.view === view);
    });
    const root = $("#view");
    const pages = {
      projects: renderProjects,
      qty: renderQty,
      prices: renderPrices,
      estimate: renderEstimate,
      export: renderExport,
    };
    root.innerHTML = "";
    root.appendChild(pages[view]());
    if (flash) {
      root.insertBefore(el(`<div class="callout info">${escapeHtml(flash)}</div>`), root.firstChild);
    }
    bindGlobal();
  }

  function bindGlobal() {
    const pick = $("#projectPick");
    if (pick) pick.onchange = () => {
      state.currentProjectId = pick.value || null;
      save();
      render();
    };
  }

  function renderProjects() {
    const list = state.projects.map((p) => `
      <tr>
        <td><b>${escapeHtml(p.name)}</b><div class="muted">${escapeHtml(p.location || "")}</div></td>
        <td>${escapeHtml(p.owner || "")}</td>
        <td class="num">${(p.qtyRows || []).length}</td>
        <td class="num">${fmtDate(p.updatedAt)}</td>
        <td class="row-actions">
          <button class="btn" data-open="${p.id}">Mở</button>
          <button class="btn" data-ren="${p.id}">Đổi tên</button>
          <button class="btn bad" data-del="${p.id}">Xóa</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="5" class="empty">Chưa có công trình. Tạo mới bên dưới.</td></tr>`;

    const box = el(`<div>
      <section class="card">
        <h2>Công trình</h2>
        <p class="muted">Dữ liệu lưu trên trình duyệt này. Nên xuất JSON để sao lưu.</p>
        <div class="table-wrap"><table>
          <thead><tr><th>Tên công trình</th><th>Chủ đầu tư</th><th class="num">Dòng KL</th><th class="num">Cập nhật</th><th></th></tr></thead>
          <tbody>${list}</tbody>
        </table></div>
      </section>
      <section class="card">
        <h2>Tạo công trình</h2>
        <div class="grid cols-3">
          <label>Tên công trình<input id="npName" placeholder="MW+GG Phú Quốc"></label>
          <label>Địa điểm<input id="npLoc" placeholder="34-36 Trần Hưng Đạo, Phú Quốc"></label>
          <label>Chủ đầu tư<input id="npOwner" placeholder="Tên chủ đầu tư"></label>
        </div>
        <div class="toolbar">
          <button class="btn pri" id="npCreate">Tạo công trình</button>
          <button class="btn" id="exportJson">Xuất JSON sao lưu</button>
          <label class="btn">Nhập JSON<input type="file" id="importJson" accept=".json,application/json" hidden></label>
        </div>
      </section>
    </div>`);

    box.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => {
      state.currentProjectId = b.dataset.open;
      view = "qty";
      save(); render();
    });
    box.querySelectorAll("[data-ren]").forEach((b) => b.onclick = () => {
      const p = state.projects.find((x) => x.id === b.dataset.ren);
      const name = prompt("Tên công trình mới:", p.name);
      if (!name) return;
      p.name = name.trim();
      p.updatedAt = new Date().toISOString();
      save(); render();
    });
    box.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
      const p = state.projects.find((x) => x.id === b.dataset.del);
      if (!confirm("Xóa công trình «" + p.name + "»? Không hoàn tác được.")) return;
      state.projects = state.projects.filter((x) => x.id !== p.id);
      if (state.currentProjectId === p.id) state.currentProjectId = null;
      save(); render();
    });
    $("#npCreate", box).onclick = () => {
      const p = C.newProject({
        name: $("#npName", box).value.trim() || "Công trình mới",
        location: $("#npLoc", box).value.trim(),
        owner: $("#npOwner", box).value.trim(),
      });
      state.projects.push(p);
      state.currentProjectId = p.id;
      save();
      setFlash("Đã tạo công trình.");
      view = "qty";
      render();
    };
    $("#exportJson", box).onclick = () => downloadBlob(
      JSON.stringify(state, null, 2),
      "pidutoan-backup.json",
      "application/json"
    );
    $("#importJson", box).onchange = (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data || !Array.isArray(data.projects)) throw new Error("File không đúng định dạng PiDự toán");
          state = Object.assign(C.defaultState(), data);
          save();
          setFlash("Đã nhập dữ liệu từ JSON.");
        } catch (e) {
          alert("Không đọc được file: " + e.message);
        }
      };
      reader.readAsText(file, "utf-8");
    };
    return box;
  }

  function needProjectCard() {
    return el(`<section class="card"><h2>Chưa chọn công trình</h2>
      <p>Hãy tạo hoặc chọn công trình ở tab Công trình.</p>
      <button class="btn pri" id="goProj">Sang tab Công trình</button></section>`);
  }

  function renderQty() {
    const p = currentProject();
    if (!p) {
      const box = needProjectCard();
      $("#goProj", box).onclick = () => { view = "projects"; render(); };
      return box;
    }
    const rows = (p.qtyRows || []).map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><input data-f="ma" data-id="${r.id}" value="${escapeHtml(r.ma || "")}"></td>
        <td><input data-f="noiDung" data-id="${r.id}" value="${escapeHtml(r.noiDung || "")}"></td>
        <td><input data-f="hangMuc" data-id="${r.id}" value="${escapeHtml(r.hangMuc || "")}"></td>
        <td><input data-f="viTri" data-id="${r.id}" value="${escapeHtml(r.viTri || "")}"></td>
        <td><input data-f="kichThuoc" data-id="${r.id}" value="${escapeHtml(r.kichThuoc || "")}"></td>
        <td><input data-f="donVi" data-id="${r.id}" value="${escapeHtml(r.donVi || "")}" style="width:64px"></td>
        <td><input data-f="kl" data-id="${r.id}" value="${escapeHtml(r.kl)}" class="num" style="width:90px"></td>
        <td>${priceSelect(r)}</td>
        <td class="muted">${escapeHtml((r.source || "").slice(0, 32))}</td>
        <td><button class="btn bad" data-delrow="${r.id}">Xóa</button></td>
      </tr>`).join("") || `<tr><td colspan="11" class="empty">Chưa có dòng khối lượng.</td></tr>`;

    const dxfHtml = dxfSession ? renderDxfTables() : `<p class="muted">Chưa tải DXF. Nên bóc layer tường / sàn / hatch; tránh layer chữ (0-TEXT) vì khung chữ không phải khối lượng xây dựng.</p>`;

    const box = el(`<div>
      <section class="card">
        <h2>Nhập khối lượng — ${escapeHtml(p.name)}</h2>
        <p class="muted">${escapeHtml(p.location || "")}${p.owner ? " · Chủ đầu tư: " + escapeHtml(p.owner) : ""}</p>
        <div class="toolbar">
          <label class="btn pri">Tải DXF<input type="file" id="dxfFile" accept=".dxf" hidden></label>
          <label class="btn">Tải Excel/CSV BKL<input type="file" id="xlsxFile" accept=".xlsx,.xls,.csv" hidden></label>
          <button class="btn" id="addRow">Thêm dòng thủ công</button>
          <button class="btn warn" id="mapSample">Gán đơn giá mẫu theo từ khóa</button>
        </div>
        <div class="callout">Nút «Gán đơn giá mẫu» chỉ gắn mã trong bộ dữ liệu mẫu để thử tính. Hãy thay bằng đơn giá thực tế trước khi đưa cho khách.</div>
      </section>
      <section class="card">
        <h3>Phân tích DXF</h3>
        <div class="toolbar">
          <label>Đơn vị bản vẽ
            <select id="dxfUnit">
              <option value="mm">mm (mặc định)</option>
              <option value="cm">cm</option>
              <option value="m">m</option>
              <option value="in">inch</option>
            </select>
          </label>
          <span class="muted" id="dxfHint"></span>
        </div>
        <div id="dxfBox">${dxfHtml}</div>
      </section>
      <section class="card">
        <h3>Bảng khối lượng (${(p.qtyRows || []).length} dòng)</h3>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>STT</th><th>Mã</th><th>Nội dung</th><th>Hạng mục / tầng</th><th>Vị trí</th>
            <th>Kích thước</th><th>ĐV</th><th>KL</th><th>Đơn giá</th><th>Nguồn</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>
    </div>`);

    $("#dxfUnit", box).value = dxfUnit;
    $("#dxfUnit", box).onchange = () => {
      dxfUnit = $("#dxfUnit", box).value;
      if (dxfSession && dxfSession.dxf) {
        dxfSession.summary = PiDxfTakeoff.summarize(dxfSession.dxf, dxfUnit);
        render();
      }
    };
    $("#dxfFile", box).onchange = (ev) => handleDxf(ev.target.files[0]);
    $("#xlsxFile", box).onchange = (ev) => handleXlsx(ev.target.files[0]);
    $("#addRow", box).onclick = () => {
      p.qtyRows.push({
        id: C.uid("kl"), ma: "", noiDung: "", viTri: "", kichThuoc: "",
        donVi: "m²", kl: 0, ghiChu: "", hangMuc: "", priceCode: "", source: "manual",
      });
      p.updatedAt = new Date().toISOString();
      save(); render();
    };
    $("#mapSample", box).onclick = () => {
      let n = 0;
      p.qtyRows.forEach((r) => {
        const code = C.suggestPriceCode(r);
        if (code) { r.priceCode = code; n++; }
      });
      p.updatedAt = new Date().toISOString();
      save();
      setFlash("Đã gán " + n + " dòng với mã đơn giá mẫu. Hãy kiểm tra lại.");
    };
    box.querySelectorAll("input[data-f]").forEach((inp) => {
      inp.onchange = () => {
        const row = p.qtyRows.find((r) => r.id === inp.dataset.id);
        if (!row) return;
        const f = inp.dataset.f;
        row[f] = f === "kl" ? C.parseNumber(inp.value) : inp.value;
        p.updatedAt = new Date().toISOString();
        save();
      };
    });
    box.querySelectorAll("select[data-price]").forEach((sel) => {
      sel.onchange = () => {
        const row = p.qtyRows.find((r) => r.id === sel.dataset.price);
        if (row) { row.priceCode = sel.value; p.updatedAt = new Date().toISOString(); save(); }
      };
    });
    box.querySelectorAll("[data-delrow]").forEach((b) => {
      b.onclick = () => {
        p.qtyRows = p.qtyRows.filter((r) => r.id !== b.dataset.delrow);
        p.updatedAt = new Date().toISOString();
        save(); render();
      };
    });
    bindDxfActions(box, p);
    return box;
  }

  function priceSelect(row) {
    const opts = [`<option value="">— chưa gán —</option>`]
      .concat(state.priceBook.map((pr) =>
        `<option value="${escapeHtml(pr.maHieu)}" ${row.priceCode === pr.maHieu ? "selected" : ""}>${escapeHtml(pr.maHieu)} — ${escapeHtml(pr.tenCongTac)}${pr.isSample ? " (mẫu)" : ""}</option>`
      )).join("");
    return `<select data-price="${row.id}">${opts}</select>`;
  }

  function renderDxfTables() {
    const s = dxfSession.summary;
    const hint = s.headerUnit ? `Header $INSUNITS gợi ý: ${s.headerUnit}. ` : "";
    const layerRows = s.layers.map((L, i) => `
      <tr>
        <td>${escapeHtml(L.layer)}</td>
        <td class="num">${L.entityCount}</td>
        <td class="num">${C.formatVN(L.lengthM, 2)}</td>
        <td class="num">${C.formatVN(L.areaM2, 2)}</td>
        <td class="num">${L.inserts}</td>
        <td>
          <select data-metric data-lidx="${i}">
            <option value="length">Dùng chiều dài (m)</option>
            <option value="area">Dùng diện tích (m²)</option>
          </select>
          <select data-layer-price data-lidx="${i}">${priceOptions()}</select>
          <button class="btn" data-add-layer data-lidx="${i}">Thêm vào KL</button>
        </td>
      </tr>`).join("");
    const blockRows = s.blocks.map((B, i) => `
      <tr>
        <td>${escapeHtml(B.name)}</td>
        <td class="num">${B.count}</td>
        <td>${escapeHtml(Object.keys(B.layers).join(", "))}</td>
        <td>
          <select data-block-price data-bidx="${i}">${priceOptions()}</select>
          <button class="btn" data-add-block data-bidx="${i}">Thêm số lượng</button>
        </td>
      </tr>`).join("");
    return `<p class="muted">${hint}Đã đọc ${s.entityCount} entity, ${s.layers.length} layer, ${s.blocks.length} loại block. Đơn vị tính: ${s.unit} → mét.</p>
      <h3>Tổng theo layer</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Layer</th><th class="num">Entity</th><th class="num">Σ dài (m)</th><th class="num">Σ diện tích (m²)</th><th class="num">INSERT</th><th>Gán công tác</th></tr></thead>
        <tbody>${layerRows || `<tr><td colspan="6">Không có layer</td></tr>`}</tbody>
      </table></div>
      <h3>Đếm block INSERT</h3>
      <div class="table-wrap"><table>
        <thead><tr><th>Tên block</th><th class="num">Số lượng</th><th>Layer</th><th>Gán công tác</th></tr></thead>
        <tbody>${blockRows || `<tr><td colspan="4">Không có INSERT</td></tr>`}</tbody>
      </table></div>`;
  }

  function priceOptions() {
    return [`<option value="">— chọn đơn giá —</option>`]
      .concat(state.priceBook.map((pr) => `<option value="${escapeHtml(pr.maHieu)}">${escapeHtml(pr.maHieu)} — ${escapeHtml(pr.tenCongTac)}</option>`))
      .join("");
  }

  function bindDxfActions(box, p) {
    box.querySelectorAll("[data-add-layer]").forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.lidx);
        const rec = dxfSession.summary.layers[idx];
        if (!rec) return;
        const metric = box.querySelector(`select[data-metric][data-lidx="${idx}"]`).value;
        const priceCode = box.querySelector(`select[data-layer-price][data-lidx="${idx}"]`).value;
        const kl = metric === "area" ? rec.areaM2 : rec.lengthM;
        const donVi = metric === "area" ? "m²" : "m";
        const layer = rec.layer;
        p.qtyRows.push({
          id: C.uid("kl"),
          ma: layer.slice(0, 24),
          noiDung: (metric === "area" ? "Diện tích layer " : "Chiều dài layer ") + layer,
          viTri: "", kichThuoc: "", donVi, kl: round4(kl), ghiChu: "Bóc từ DXF layer " + layer,
          hangMuc: "DXF", priceCode, source: "dxf:" + layer,
        });
        p.updatedAt = new Date().toISOString();
        save();
        setFlash("Đã thêm layer «" + layer + "» (" + C.formatVN(kl, 2) + " " + donVi + ").");
      };
    });
    box.querySelectorAll("[data-add-block]").forEach((b) => {
      b.onclick = () => {
        const idx = Number(b.dataset.bidx);
        const rec = dxfSession.summary.blocks[idx];
        if (!rec) return;
        const name = rec.name;
        const priceCode = box.querySelector(`select[data-block-price][data-bidx="${idx}"]`).value;
        p.qtyRows.push({
          id: C.uid("kl"),
          ma: name.slice(0, 24),
          noiDung: "Số lượng block " + name,
          viTri: "", kichThuoc: "", donVi: "bộ", kl: rec.count,
          ghiChu: "Đếm INSERT DXF", hangMuc: "DXF", priceCode, source: "dxf-block:" + name,
        });
        p.updatedAt = new Date().toISOString();
        save();
        setFlash("Đã thêm " + rec.count + " block «" + name + "».");
      };
    });
  }

  function round4(n) { return Math.round(Number(n) * 10000) / 10000; }

  function handleDxf(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = reader.result;
        const dxf = PiDxfTakeoff.parseText(text);
        dxfSession = { name: file.name, dxf, summary: PiDxfTakeoff.summarize(dxf, dxfUnit) };
        setFlash("Đã phân tích " + file.name + " — " + dxfSession.summary.entityCount + " entity.");
      } catch (e) {
        console.error(e);
        alert("Không phân tích được DXF: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  function handleXlsx(file) {
    if (!file) return;
    const p = currentProject();
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const wb = XLSX.read(reader.result, { type: "array" });
        const parsed = PiExcel.parseWorkbook(wb, C.parseNumber);
        parsed.rows.forEach((row) => {
          p.qtyRows.push(Object.assign({ id: C.uid("kl"), priceCode: C.suggestPriceCode(row) }, row));
        });
        p.updatedAt = new Date().toISOString();
        save();
        const sheetInfo = parsed.sheets.map((s) => s.sheet + ": " + s.count).join("; ");
        setFlash("Đã nhập " + parsed.rows.length + " dòng từ " + file.name + " (" + sheetInfo + ").");
      } catch (e) {
        console.error(e);
        alert("Không đọc được Excel: " + e.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function renderPrices() {
    const rows = state.priceBook.map((pr) => `
      <tr>
        <td><input data-pf="maHieu" data-id="${pr.id}" value="${escapeHtml(pr.maHieu)}"></td>
        <td><input data-pf="tenCongTac" data-id="${pr.id}" value="${escapeHtml(pr.tenCongTac)}"></td>
        <td><input data-pf="donVi" data-id="${pr.id}" value="${escapeHtml(pr.donVi)}" style="width:70px"></td>
        <td><input data-pf="dgVL" data-id="${pr.id}" value="${pr.dgVL}" class="num"></td>
        <td><input data-pf="dgNC" data-id="${pr.id}" value="${pr.dgNC}" class="num"></td>
        <td><input data-pf="dgMay" data-id="${pr.id}" value="${pr.dgMay}" class="num"></td>
        <td>${pr.isSample ? '<span class="tag sample">Dữ liệu mẫu</span>' : '<span class="tag">Người dùng</span>'}</td>
        <td><button class="btn bad" data-delp="${pr.id}">Xóa</button></td>
      </tr>`).join("");
    const box = el(`<div>
      <section class="card">
        <h2>Thư viện đơn giá</h2>
        <div class="callout">Các dòng gắn nhãn «Dữ liệu mẫu» chỉ để chạy thử giao diện. Không trình bày chúng như đơn giá công bố của Sở Xây dựng hay định mức Thông tư 38/2026/TT-BXD. Hãy nhập hoặc tải bảng giá thật (tỉnh, ngày áp dụng) rồi xóa dữ liệu mẫu.</div>
        <div class="toolbar">
          <button class="btn pri" id="addPrice">Thêm dòng đơn giá</button>
          <button class="btn" id="exportPrices">Xuất CSV/Excel</button>
          <label class="btn">Nhập CSV/Excel<input type="file" id="importPrices" accept=".xlsx,.xls,.csv" hidden></label>
          <button class="btn warn" id="restoreSample">Khôi phục bộ mẫu</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Mã hiệu</th><th>Tên công tác</th><th>ĐV</th>
            <th>Đơn giá VL</th><th>Đơn giá NC</th><th>Đơn giá máy</th><th>Nguồn</th><th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </section>
    </div>`);
    box.querySelectorAll("input[data-pf]").forEach((inp) => {
      inp.onchange = () => {
        const pr = state.priceBook.find((x) => x.id === inp.dataset.id);
        if (!pr) return;
        const f = inp.dataset.pf;
        if (f === "dgVL" || f === "dgNC" || f === "dgMay") pr[f] = C.parseNumber(inp.value);
        else pr[f] = inp.value;
        if (pr.isSample && f !== "maHieu") { /* still sample until user says otherwise */ }
        save();
      };
    });
    box.querySelectorAll("[data-delp]").forEach((b) => {
      b.onclick = () => {
        state.priceBook = state.priceBook.filter((x) => x.id !== b.dataset.delp);
        save(); render();
      };
    });
    $("#addPrice", box).onclick = () => {
      state.priceBook.push({
        id: C.uid("dg"), maHieu: "", tenCongTac: "", donVi: "m²",
        dgVL: 0, dgNC: 0, dgMay: 0, isSample: false, nguon: "Người dùng nhập", nhom: "",
      });
      save(); render();
    };
    $("#restoreSample", box).onclick = () => {
      if (!confirm("Thêm lại bộ dữ liệu mẫu vào thư viện?")) return;
      (window.PIDUTOAN_SAMPLE_PRICES || []).forEach((p) => {
        if (!state.priceBook.some((x) => x.maHieu === p.maHieu && x.isSample)) {
          state.priceBook.push(Object.assign({ id: C.uid("dg") }, p));
        }
      });
      save(); render();
    };
    $("#exportPrices", box).onclick = () => exportPriceBook();
    $("#importPrices", box).onchange = (ev) => {
      const file = ev.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const wb = XLSX.read(reader.result, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        const rowsIn = PiExcel.parsePriceSheet(aoa, C.parseNumber);
        rowsIn.forEach((r) => state.priceBook.push(Object.assign({ id: C.uid("dg") }, r)));
        save();
        setFlash("Đã nhập " + rowsIn.length + " đơn giá từ file người dùng.");
      };
      reader.readAsArrayBuffer(file);
    };
    return box;
  }

  function renderEstimate() {
    const p = currentProject();
    if (!p) {
      const box = needProjectCard();
      $("#goProj", box).onclick = () => { view = "projects"; render(); };
      return box;
    }
    const est = C.computeEstimate(p, state.priceBook);
    const body = est.groups.map((g) => {
      const lines = g.rows.map((r) => `
        <tr>
          <td>${escapeHtml(r.ma || "")}</td>
          <td>${escapeHtml(r.tenCongTac || r.noiDung || "")}</td>
          <td>${escapeHtml(r.viTri || "")}</td>
          <td>${escapeHtml(r.donVi || "")}</td>
          <td class="num">${C.formatVN(r.kl, 2)}</td>
          <td class="num">${C.formatVN(r.dgVL, 0)}</td>
          <td class="num">${C.formatVN(r.dgNC, 0)}</td>
          <td class="num">${C.formatVN(r.dgMay, 0)}</td>
          <td class="num">${C.formatMoney(r.total)}</td>
        </tr>`).join("");
      return `<tr class="group"><td colspan="8">${escapeHtml(g.name)}</td><td class="num">${C.formatMoney(g.subtotal)}</td></tr>${lines}`;
    }).join("") || `<tr><td colspan="9" class="empty">Chưa có khối lượng.</td></tr>`;

    const box = el(`<div>
      <div class="print-only print-head">
        <h1>BẢNG DỰ TOÁN — ${escapeHtml(p.name)}</h1>
        <div>Địa điểm: ${escapeHtml(p.location || "—")} · Chủ đầu tư: ${escapeHtml(p.owner || "—")}</div>
        <div>Xuất từ PiDự toán · ${fmtDate(new Date().toISOString())}</div>
      </div>
      <section class="card">
        <h2>Dự toán — ${escapeHtml(p.name)}</h2>
        <p class="muted">${escapeHtml(p.location || "")}${p.owner ? " · " + escapeHtml(p.owner) : ""}</p>
        <div class="callout info">Chi phí trực tiếp = KL × (đơn giá VL + NC + máy). Các tỷ lệ dưới đây do người dùng tự nhập theo quy định hiện hành — Luật Xây dựng 135/2025/QH15, Nghị định 206/2026/NĐ-CP, Thông tư 38/2026/TT-BXD. App không gắn cứng định mức.</div>
        <div class="grid cols-4">
          <label>Chi phí chung (%)<input id="rtCpc" type="number" step="0.01" value="${est.rates.cpc}"></label>
          <label>TNCTT (%)<input id="rtTn" type="number" step="0.01" value="${est.rates.tnctt}"></label>
          <label>VAT (%)<input id="rtVat" type="number" step="0.01" value="${est.rates.vat}"></label>
          <label>Dự phòng (%)<input id="rtDp" type="number" step="0.01" value="${est.rates.duPhong}"></label>
        </div>
        <div class="toolbar no-print">
          <button class="btn pri" id="saveRates">Cập nhật tỷ lệ</button>
        </div>
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Mã</th><th>Công tác</th><th>Vị trí</th><th>ĐV</th><th class="num">KL</th>
            <th class="num">ĐG VL</th><th class="num">ĐG NC</th><th class="num">ĐG máy</th><th class="num">Thành tiền</th>
          </tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </section>
      <section class="card">
        <h3>Tổng hợp</h3>
        ${kpi("Chi phí trực tiếp (VL + NC + máy)", est.direct)}
        ${kpi("Chi phí chung", est.cpc)}
        ${kpi("Thu nhập chịu thuế tính trước", est.tnctt)}
        ${kpi("Giá trước VAT", est.beforeVat)}
        ${kpi("VAT", est.vat)}
        ${kpi("Dự phòng", est.duPhong)}
        ${kpi("TỔNG CỘNG", est.grand)}
      </section>
    </div>`);
    $("#saveRates", box).onclick = () => {
      p.rates = Object.assign(C.defaultRates(), p.rates, {
        cpc: C.parseNumber($("#rtCpc", box).value),
        tnctt: C.parseNumber($("#rtTn", box).value),
        vat: C.parseNumber($("#rtVat", box).value),
        duPhong: C.parseNumber($("#rtDp", box).value),
      });
      p.updatedAt = new Date().toISOString();
      save(); render();
    };
    return box;
  }

  function kpi(label, value) {
    return `<div class="kpi"><span>${escapeHtml(label)}</span><b>${C.formatMoney(value)}</b></div>`;
  }

  function renderExport() {
    const p = currentProject();
    if (!p) {
      const box = needProjectCard();
      $("#goProj", box).onclick = () => { view = "projects"; render(); };
      return box;
    }
    const box = el(`<div>
      <section class="card">
        <h2>Xuất hồ sơ</h2>
        <p>Xuất bảng dự toán Excel (có công thức thành tiền và cộng tỷ lệ) hoặc in PDF bằng hộp thoại in của trình duyệt.</p>
        <div class="toolbar">
          <button class="btn pri" id="expXlsx">Xuất Excel</button>
          <button class="btn" id="expPrint">In / lưu PDF</button>
        </div>
        <div class="callout">File Excel ghi rõ «đơn giá do người dùng cung cấp / dữ liệu mẫu» trên dòng tiêu đề. Không trình bày đây là dự toán pháp lý đã thẩm định.</div>
      </section>
    </div>`);
    $("#expXlsx", box).onclick = () => exportEstimateXlsx(p);
    $("#expPrint", box).onclick = () => {
      view = "estimate";
      render();
      setTimeout(() => window.print(), 200);
    };
    return box;
  }

  function exportPriceBook() {
    const aoa = [["Mã hiệu", "Nội dung", "Đơn vị", "ĐG VL", "ĐG NC", "ĐG máy", "Ghi chú"]];
    state.priceBook.forEach((p) => {
      aoa.push([p.maHieu, p.tenCongTac, p.donVi, p.dgVL, p.dgNC, p.dgMay, p.isSample ? window.PIDUTOAN_SAMPLE_NOTE : (p.nguon || "")]);
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "DonGia");
    XLSX.writeFile(wb, "pidutoan-don-gia.xlsx");
  }

  function exportEstimateXlsx(p) {
    const est = C.computeEstimate(p, state.priceBook);
    const wb = XLSX.utils.book_new();
    const head = [
      ["BẢNG DỰ TOÁN"],
      ["Công trình", p.name],
      ["Địa điểm", p.location || ""],
      ["Chủ đầu tư", p.owner || ""],
      ["Xuất từ PiDự toán — file hỗ trợ soạn thảo, không thay thế thẩm định"],
      ["Căn cứ cần theo dõi: Luật XD 135/2025/QH15; NĐ 206/2026/NĐ-CP; TT 38/2026/TT-BXD. Tỷ lệ CPC/TNCTT/VAT/dự phòng do người dùng nhập."],
      [],
      ["STT", "Mã", "Nội dung", "Hạng mục", "Vị trí", "ĐV", "KL", "ĐG VL", "ĐG NC", "ĐG máy", "TT VL", "TT NC", "TT máy", "Thành tiền", "Nguồn đơn giá"],
    ];
    const aoa = head.slice();
    let r = 9;
    est.rows.forEach((row, i) => {
      const excelRow = r + i;
      aoa.push([
        i + 1, row.ma || "", row.tenCongTac || row.noiDung || "", row.hangMuc || "",
        row.viTri || "", row.donVi || "", row.kl, row.dgVL, row.dgNC, row.dgMay,
        { f: `G${excelRow}*H${excelRow}` },
        { f: `G${excelRow}*I${excelRow}` },
        { f: `G${excelRow}*J${excelRow}` },
        { f: `K${excelRow}+L${excelRow}+M${excelRow}` },
        row.price && row.price.isSample ? "DỮ LIỆU MẪU — thay bằng đơn giá thực tế" : ((row.price && row.price.nguon) || ""),
      ]);
    });
    const firstData = 9;
    const lastData = 8 + est.rows.length;
    const totalRow = lastData + 2;
    const klRange = est.rows.length ? `N${firstData}:N${lastData}` : null;
    aoa.push([]);
    aoa.push(["", "", "Chi phí trực tiếp", "", "", "", "", "", "", "", "", "", "", klRange ? { f: `SUM(${klRange})` } : 0]);
    aoa.push(["", "", "Chi phí chung (%)", "", "", "", est.rates.cpc, "", "", "", "", "", "", { f: `N${totalRow}*G${totalRow + 1}/100` }]);
    aoa.push(["", "", "TNCTT (%)", "", "", "", est.rates.tnctt, "", "", "", "", "", "", { f: `(N${totalRow}+N${totalRow + 1})*G${totalRow + 2}/100` }]);
    aoa.push(["", "", "Giá trước VAT", "", "", "", "", "", "", "", "", "", "", { f: `N${totalRow}+N${totalRow + 1}+N${totalRow + 2}` }]);
    aoa.push(["", "", "VAT (%)", "", "", "", est.rates.vat, "", "", "", "", "", "", { f: `N${totalRow + 3}*G${totalRow + 4}/100` }]);
    aoa.push(["", "", "Dự phòng (%)", "", "", "", est.rates.duPhong, "", "", "", "", "", "", { f: `(N${totalRow + 3}+N${totalRow + 4})*G${totalRow + 5}/100` }]);
    aoa.push(["", "", "TỔNG CỘNG", "", "", "", "", "", "", "", "", "", "", { f: `N${totalRow + 3}+N${totalRow + 4}+N${totalRow + 5}` }]);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [6, 14, 40, 16, 16, 8, 10, 12, 12, 12, 14, 14, 14, 16, 40].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "DuToan");
    const safe = (p.name || "dutoan").replace(/[^\p{L}\p{N}-]+/gu, "_").slice(0, 40);
    XLSX.writeFile(wb, "pidutoan-" + safe + ".xlsx");
  }

  function downloadBlob(text, name, type) {
    const blob = new Blob([text], { type: type || "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  document.querySelectorAll("nav.tabs button").forEach((b) => {
    b.onclick = () => { view = b.dataset.view; render(); };
  });
  $("#themeBtn").onclick = () => {
    state.theme = (state.theme || "dark") === "dark" ? "light" : "dark";
    save(); render();
  };

  render();
})();
