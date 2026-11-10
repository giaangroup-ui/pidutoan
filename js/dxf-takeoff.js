(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.PiDxfTakeoff = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  function dist(a, b) {
    return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
  }

  function bulgeArcLength(p1, p2, bulge) {
    const chord = dist(p1, p2);
    if (!bulge) return chord;
    const theta = 4 * Math.atan(bulge);
    if (Math.abs(theta) < 1e-12) return chord;
    const radius = chord / (2 * Math.sin(Math.abs(theta) / 2));
    return Math.abs(radius * theta);
  }

  function normalizeVerts(raw, closedFlag) {
    const verts = (raw || [])
      .map((v) => ({
        x: Number(v.x || 0),
        y: Number(v.y || 0),
        bulge: Number(v.bulge || 0),
      }))
      .filter((v) => Number.isFinite(v.x) && Number.isFinite(v.y));
    let closed = !!(closedFlag);
    if (verts.length > 2) {
      const f = verts[0];
      const l = verts[verts.length - 1];
      if (dist(f, l) < 1e-6) {
        closed = true;
        verts.pop();
      }
    }
    return { verts, closed };
  }

  function polylineLength(verts, closed) {
    if (!verts || verts.length < 2) return 0;
    let L = 0;
    const n = verts.length;
    const count = closed ? n : n - 1;
    for (let i = 0; i < count; i++) {
      L += bulgeArcLength(verts[i], verts[(i + 1) % n], verts[i].bulge || 0);
    }
    return L;
  }

  function shoelace(verts) {
    if (!verts || verts.length < 3) return 0;
    let s = 0;
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      s += a.x * b.y - b.x * a.y;
    }
    return Math.abs(s) / 2;
  }

  function entityVerts(entity) {
    if (entity.vertices && entity.vertices.length) return entity.vertices;
    if (entity.points && entity.points.length) return entity.points;
    if (entity.start && entity.end) return [entity.start, entity.end];
    if (entity.vertices === undefined && entity.x !== undefined) return [entity];
    return [];
  }

  function isClosed(entity, verts) {
    if (entity.shape || entity.closed || entity.flags === 1) return true;
    if (typeof entity.flag === "number" && entity.flag & 1) return true;
    if (verts && verts.length > 2) {
      const f = verts[0];
      const l = verts[verts.length - 1];
      return dist(f, l) < 1e-4;
    }
    return false;
  }

  function collectHatchLoops(entity) {
    const loops = [];
    const candidates = [
      entity.boundaryLoops,
      entity.boundaries,
      entity.boundary,
      entity.paths,
    ];
    for (const c of candidates) {
      if (!c) continue;
      if (Array.isArray(c) && c.length && Array.isArray(c[0])) {
        c.forEach((loop) => loops.push(loop));
      } else if (Array.isArray(c) && c.length && c[0] && (c[0].x !== undefined || c[0].vertices)) {
        if (c[0].vertices) c.forEach((loop) => loops.push(loop.vertices || []));
        else loops.push(c);
      }
    }
    if (entity.edges && Array.isArray(entity.edges)) {
      const pts = [];
      entity.edges.forEach((e) => {
        if (e.start) pts.push(e.start);
        if (e.end) pts.push(e.end);
        if (e.vertices) e.vertices.forEach((v) => pts.push(v));
      });
      if (pts.length) loops.push(pts);
    }
    return loops;
  }

  function unitScaleToMeters(unit) {
    switch (unit) {
      case "m":
        return 1;
      case "cm":
        return 0.01;
      case "in":
        return 0.0254;
      case "mm":
      default:
        return 0.001;
    }
  }

  function headerUnitHint(dxf) {
    try {
      const u = dxf.header && (dxf.header.$INSUNITS || dxf.header.insunits);
      const val = typeof u === "object" ? u : u;
      const n = typeof val === "number" ? val : Number(val && val.value);
      const map = { 1: "in", 4: "mm", 5: "cm", 6: "m" };
      return map[n] || null;
    } catch (e) {
      return null;
    }
  }

  function summarize(dxf, unit) {
    const scale = unitScaleToMeters(unit || "mm");
    const areaScale = scale * scale;
    const layers = {};
    const blocks = {};
    const entities = (dxf && dxf.entities) || [];

    function bump(layerName) {
      const name = layerName || "(không tên)";
      if (!layers[name]) {
        layers[name] = {
          layer: name,
          lines: 0,
          polylines: 0,
          hatches: 0,
          inserts: 0,
          other: 0,
          lengthDu: 0,
          areaDu: 0,
        };
      }
      return layers[name];
    }

    entities.forEach((entity) => {
      const type = (entity.type || "").toUpperCase();
      const rec = bump(entity.layer);
      if (type === "LINE") {
        const verts = entityVerts(entity);
        rec.lines += 1;
        rec.lengthDu += polylineLength(normalizeVerts(verts, false).verts, false);
      } else if (type === "LWPOLYLINE" || type === "POLYLINE") {
        const raw = entityVerts(entity);
        const { verts, closed } = normalizeVerts(raw, isClosed(entity, raw));
        rec.polylines += 1;
        rec.lengthDu += polylineLength(verts, closed);
        if (closed) rec.areaDu += shoelace(verts);
      } else if (type === "HATCH") {
        rec.hatches += 1;
        const loops = collectHatchLoops(entity);
        if (loops.length) {
          loops.forEach((loop) => {
            const { verts, closed } = normalizeVerts(loop, true);
            if (closed || verts.length >= 3) rec.areaDu += shoelace(verts);
          });
        } else if (entity.vertices) {
          const { verts } = normalizeVerts(entity.vertices, true);
          rec.areaDu += shoelace(verts);
        }
      } else if (type === "INSERT") {
        const name = entity.name || entity.block || "(không tên)";
        rec.inserts += 1;
        if (!blocks[name]) blocks[name] = { name, count: 0, layers: {} };
        blocks[name].count += 1;
        blocks[name].layers[entity.layer || "(không tên)"] =
          (blocks[name].layers[entity.layer || "(không tên)"] || 0) + 1;
      } else {
        rec.other += 1;
      }
    });

    const layerList = Object.values(layers)
      .map((r) => ({
        ...r,
        lengthM: r.lengthDu * scale,
        areaM2: r.areaDu * areaScale,
        entityCount: r.lines + r.polylines + r.hatches + r.inserts + r.other,
      }))
      .sort((a, b) => b.entityCount - a.entityCount);

    const blockList = Object.values(blocks).sort((a, b) => b.count - a.count);

    return {
      unit: unit || "mm",
      headerUnit: headerUnitHint(dxf),
      entityCount: entities.length,
      layers: layerList,
      blocks: blockList,
    };
  }

  function extractHatchEntities(text) {
    const lines = String(text).split(/\r?\n/);
    const out = [];
    let section = "";
    let i = 0;
    function readPair() {
      while (i + 1 < lines.length) {
        const code = parseInt(lines[i], 10);
        const val = lines[i + 1];
        i += 2;
        if (Number.isFinite(code)) return [code, val];
      }
      return null;
    }
    let pair;
    let current = null;
    let currentPath = null;
    let inPaths = false;
    function flushPath() {
      if (current && currentPath && currentPath.verts.length >= 3) {
        current.paths.push(currentPath.verts);
      }
      currentPath = null;
    }
    function flushHatch() {
      flushPath();
      if (current) {
        current.paths.forEach((verts) => {
          out.push({ type: "HATCH", layer: current.layer, vertices: verts, shape: true });
        });
      }
      current = null;
      inPaths = false;
    }
    while ((pair = readPair())) {
      const [code, val] = pair;
      if (code === 0 && val === "SECTION") {
        const next = readPair();
        if (next && next[0] === 2) section = next[1];
        continue;
      }
      if (code === 0 && val === "ENDSEC") {
        if (current) flushHatch();
        section = "";
        continue;
      }
      if (section !== "ENTITIES") continue;
      if (code === 0) {
        if (val === "HATCH") {
          if (current) flushHatch();
          current = { layer: "(không tên)", paths: [] };
          inPaths = false;
        } else if (current) {
          flushHatch();
        }
        continue;
      }
      if (!current) continue;
      if (code === 8 && !inPaths) current.layer = val;
      if (code === 91) {
        inPaths = true;
        continue;
      }
      if (!inPaths) continue;
      if (code === 92) {
        flushPath();
        const flags = parseInt(val, 10) || 0;
        currentPath = { polyline: !!(flags & 2), verts: [] };
        continue;
      }
      if (code === 10) {
        if (!currentPath) currentPath = { polyline: true, verts: [] };
        currentPath._x = parseFloat(val);
        continue;
      }
      if (code === 20) {
        if (!currentPath) currentPath = { polyline: true, verts: [] };
        const x = currentPath._x;
        const y = parseFloat(val);
        if (Number.isFinite(x) && Number.isFinite(y)) currentPath.verts.push({ x, y });
        delete currentPath._x;
      }
    }
    if (current) flushHatch();
    return out;
  }

  function parseText(text, ParserCtor) {
    const Parser = ParserCtor || (typeof DxfParser !== "undefined" ? DxfParser : null);
    if (!Parser) throw new Error("Thiếu thư viện dxf-parser");
    const parser = new Parser();
    const dxf = parser.parseSync(text);
    const hatches = extractHatchEntities(text);
    dxf.entities = (dxf.entities || []).concat(hatches);
    dxf._hatchesExtracted = hatches.length;
    return dxf;
  }

  return { summarize, parseText, extractHatchEntities, unitScaleToMeters, polylineLength, shoelace, normalizeVerts };
});
