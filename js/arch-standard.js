/* Chuẩn layer bộ môn Kiến trúc: hồ sơ ánh xạ layer → loại, quy tắc block, kiểm tra "hồ sơ chưa chuẩn". */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiArch = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const CATS = {
    wall_demo: { label: "Tường / vách phá dỡ", role: "qty", kind: "wall" },
    wall_new: { label: "Tường / vách xây mới", role: "qty", kind: "wall" },
    wall_keep: { label: "Tường hiện hữu giữ lại", role: "ref", kind: "wall" },
    wall: { label: "Tường (chưa phân loại)", role: "qty", kind: "wall" },
    floor_demo: { label: "Sàn / hoàn thiện tháo dỡ", role: "qty", kind: "area" },
    floor_finish: { label: "Sàn / hoàn thiện", role: "qty", kind: "area" },
    hatch_demo: { label: "Hatch phá dỡ", role: "info", kind: "area" },
    hatch_new: { label: "Hatch xây mới", role: "info", kind: "area" },
    hatch_keep: { label: "Hatch giữ lại", role: "info", kind: "area" },
    hatch: { label: "Hatch (chung)", role: "info", kind: "area" },
    door: { label: "Cửa đi", role: "qty", kind: "opening" },
    window: { label: "Cửa sổ / vách kính", role: "qty", kind: "opening" },
    furniture: { label: "Nội thất / thiết bị", role: "qty", kind: "block" },
    column: { label: "Cột", role: "ref", kind: "struct" },
    stair: { label: "Cầu thang", role: "qty", kind: "area" },
    axis: { label: "Lưới trục", role: "note", kind: "note" },
    dim: { label: "Kích thước (dim)", role: "note", kind: "note" },
    text: { label: "Chữ / ghi chú", role: "note", kind: "note" },
    tag: { label: "Tag / ký hiệu mã", role: "note", kind: "tag" },
    leader: { label: "Đường dẫn tag", role: "note", kind: "leader" },
    titleblock: { label: "Khung tên", role: "note", kind: "frame" },
    site: { label: "Tổng mặt bằng", role: "note", kind: "note" },
    ignore: { label: "Bỏ qua", role: "ignore", kind: "note" },
  };

  // Nguồn: layer có thật trong BV_PHA_DO_v3.7.dxf, LAYER_STANDARD.md (PiCAD job1/v3) và chuẩn A-* của app PiCAD.
  const DEFAULT_LAYERS = [
    ["0-WALL-PHA-DO", "wall_demo", "", "v3.7 — nét tường/vách phá dỡ"],
    ["0-WALL-XÂY MỚI", "wall_new", "", "v3.7 — tường xây mới"],
    ["0-WALL-XÂY MỚI-CAO 1M25", "wall_new", "1250", "LAYER_STANDARD — tường mới cao 1250"],
    ["0-WALL-XÂY MỚI-CAO 2M8", "wall_new", "2800", "LAYER_STANDARD — tường mới cao 2800"],
    ["A-WALL-GIULAI", "wall_keep", "", "v3.7 — tường giữ lại trên tờ XM"],
    ["0-WALL-HIEN TRANG", "wall_keep", "", "v3.7 — tường hiện trạng giữ lại"],
    ["0-WALL-VÁCH HIEN TRANG", "wall_keep", "", "v3.7 — vách giữ lại"],
    ["0-WALL-GIU-XAM", "wall_keep", "", "v3.7 — tường giữ lại (xám) trên tờ XM"],
    ["A-WALL", "wall", "", "chuẩn PiCAD"],
    ["0-HATCH 2-ĐẬP BỎ", "hatch_demo", "", "v3.7 — hatch phá dỡ ANSI37"],
    ["0-HATCH 2-XÂY MỚI", "hatch_new", "", "v3.7 — hatch tường mới"],
    ["0-HATCH 2-XÂY MỚI-CAO 1M25", "hatch_new", "", "LAYER_STANDARD"],
    ["0-HATCH 2-XÂY MỚI-CAO 2M8", "hatch_new", "", "LAYER_STANDARD"],
    ["0-HATCH 2-HIEN TRANG", "hatch_keep", "", "v3.7 — hatch giữ lại"],
    ["0-HATCH 2-PHẦN VÁCH HIEN TR", "hatch_keep", "", "v3.7 — hatch vách giữ lại"],
    ["0-HATCH 2-PHẦN THÁO DỠ", "hatch_demo", "", "LAYER_STANDARD"],
    ["A-HATCH", "hatch", "", "chuẩn PiCAD"],
    ["0-SÀN-THÁO DỠ", "floor_demo", "", "v3.7 — sàn / hoàn thiện tháo dỡ"],
    ["A-FLOR*", "floor_finish", "", "sàn / hoàn thiện"],
    ["0-DOOR_PLAN", "door", "", "v3.7 — block cửa PI_D*"],
    ["A-DOOR", "door", "", "chuẩn PiCAD"],
    ["0-WIND_PLAN", "window", "", "LAYER_STANDARD — block PI_S*"],
    ["A-WIND", "window", "", "chuẩn PiCAD"],
    ["A-GLAZ", "window", "", "kính / vách kính"],
    ["A-FURN", "furniture", "", "chuẩn PiCAD"],
    ["0-FURN-REF", "furniture", "", "LAYER_STANDARD — vật dụng tham chiếu"],
    ["A-COLS", "column", "", "v3.7 — cột"],
    ["A-FLOR-STRS*", "stair", "", "cầu thang"],
    ["A-AXIS", "axis", "", "v3.7 / chuẩn PiCAD — lưới trục"],
    ["0-DIM", "dim", "", "v3.7 — chuỗi kích thước"],
    ["A-DIMS", "dim", "", "chuẩn PiCAD"],
    ["A-ANNO-DIMS", "dim", "", "LAYER_STANDARD"],
    ["0-TEXT", "text", "", "v3.7 — chữ, bảng"],
    ["0-TEXT_VIET", "text", "", "LAYER_STANDARD"],
    ["0-NOTES", "text", "", "v3.7 — ghi chú"],
    ["A-TEXT", "text", "", "chuẩn PiCAD"],
    ["A-ANNO-TEXT", "text", "", "LAYER_STANDARD — chữ khung tên"],
    ["0-TAG-*", "tag", "", "v3.7 — tag mã (DEMO / XM / KS / SAN / CUA)"],
    ["0-LEADER", "leader", "", "v3.7 — đường dẫn tag"],
    ["A-ANNO-TTLB", "titleblock", "", "v3.7 — khung tên GGG"],
    ["A-LINE-FINE", "titleblock", "", "LAYER_STANDARD"],
    ["A-SITE", "site", "", "chuẩn PiCAD"],
    ["0-CLOUD", "ignore", "", "LAYER_STANDARD — revision cloud"],
    ["0", "ignore", "", "layer mặc định"],
    ["Defpoints", "ignore", "", "layer hệ thống"],
  ];

  const DEFAULT_BLOCKS = [
    ["GGG Title Block*", "titleblock", "no", "khung tên — không cần mã"],
    ["Luoi truc*", "axis", "no", "lưới trục — không cần mã"],
    ["GGG142_COT", "column", "no", "cột — không cần mã"],
    ["PI_D*", "door", "yes", "cửa đi PiCAD, mã D1, D2…"],
    ["PI_S*", "window", "yes", "cửa sổ PiCAD, mã S1, S2…"],
    ["PI_F*", "furniture", "yes", "vật dụng PiCAD, mã F-01…"],
  ];

  function defaultProfile() {
    return {
      name: "Kiến trúc — chuẩn PiCAD (v3.7)",
      layers: DEFAULT_LAYERS.map(([pattern, cat, hMm, note]) => ({ pattern, cat, hMm, note })),
      blocks: DEFAULT_BLOCKS.map(([pattern, cat, needCode, note]) => ({ pattern, cat, needCode: needCode === "yes", note })),
    };
  }

  const nf = (s) => String(s || "").normalize("NFC").trim().toUpperCase();
  const cache = new Map();
  function wildcard(pattern) {
    const k = pattern;
    if (!cache.has(k)) cache.set(k, new RegExp("^" + nf(pattern).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"));
    return cache.get(k);
  }
  function findRule(list, name) {
    const n = nf(name);
    const exact = list.find((r) => !r.pattern.includes("*") && nf(r.pattern) === n);
    return exact || list.find((r) => r.pattern.includes("*") && wildcard(r.pattern).test(n)) || null;
  }
  function layerRule(profile, layer) { return findRule(profile.layers, layer); }
  function blockRule(profile, name) { return findRule(profile.blocks, name); }

  /** Mã loại từ thuộc tính MA_LOAI hoặc tên block: D1, S2, F-05… */
  function blockCode(name, attribs) {
    const a = attribs || {};
    const fromAttr = a.MA_LOAI || a.MA || a.CODE || a.TYPE;
    if (fromAttr && /^[A-Z]{1,3}-?\d{1,3}$/i.test(String(fromAttr).trim())) return String(fromAttr).trim().toUpperCase();
    const m = String(name || "").match(/^(?:PI_)?(D|S|DM|CS|CD|W)[-_]?(\d{1,3})$/i);
    if (m) return m[1].toUpperCase() + m[2];
    const f = String(name || "").match(/^(?:PI_)?F[-_]?(\d{1,3})$/i);
    if (f) return "F-" + f[1].padStart(2, "0");
    return null;
  }

  /** Kiểm tra "hồ sơ chưa chuẩn": layer chưa có trong hồ sơ, block chưa có mã. */
  function audit(dxf, profile) {
    const layerCount = {}, blockStat = {};
    (dxf.entities || []).forEach((e) => {
      const L = e.layer || "0";
      layerCount[L] = (layerCount[L] || 0) + 1;
      if (e.type === "INSERT") {
        const s = blockStat[e.name] || (blockStat[e.name] = { name: e.name, count: 0, layers: {}, codes: {}, uncoded: 0 });
        s.count++; s.layers[L] = (s.layers[L] || 0) + 1;
        const code = blockCode(e.name, e.attribs);
        if (code) s.codes[code] = (s.codes[code] || 0) + 1; else s.uncoded++;
      }
    });
    const unmappedLayers = Object.keys(layerCount).filter((L) => !layerRule(profile, L))
      .map((L) => ({ layer: L, count: layerCount[L] })).sort((a, b) => b.count - a.count);
    const mappedLayers = Object.keys(layerCount).filter((L) => layerRule(profile, L))
      .map((L) => ({ layer: L, count: layerCount[L], cat: layerRule(profile, L).cat }));
    const uncodedBlocks = [];
    Object.values(blockStat).forEach((b) => {
      const br = blockRule(profile, b.name);
      const layerCats = Object.keys(b.layers).map((L) => (layerRule(profile, L) || {}).cat);
      const needs = br ? br.needCode : (!br && (layerCats.some((c) => ["door", "window", "furniture"].includes(c)) || true));
      if (!br && b.uncoded === 0) { uncodedBlocks.push({ name: b.name, count: b.count, layers: Object.keys(b.layers), reason: "Block chưa có trong hồ sơ chuẩn (đã có mã " + Object.keys(b.codes).join(", ") + ")" }); return; }
      if (needs && b.uncoded > 0) {
        uncodedBlocks.push({
          name: b.name, count: b.uncoded, layers: Object.keys(b.layers),
          reason: /^\*U/i.test(b.name) ? "Block ẩn danh (*U…), không có mã loại / thuộc tính MA_LOAI" : br ? "Block cần mã loại nhưng không có MA_LOAI / tên không theo mã" : "Block chưa có trong hồ sơ chuẩn và không có mã loại",
        });
      }
    });
    return { unmappedLayers, mappedLayers, uncodedBlocks, blockStat };
  }

  return { CATS, defaultProfile, layerRule, blockRule, blockCode, audit };
});
