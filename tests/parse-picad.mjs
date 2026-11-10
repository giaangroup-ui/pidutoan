import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const DxfParser = require("dxf-parser");
const XLSX = require("xlsx");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadScript(file) {
  const code = fs.readFileSync(path.join(root, file), "utf8");
  const module = { exports: {} };
  const fn = new Function("module", "exports", "window", "globalThis", "DxfParser", "XLSX", code + "\nreturn typeof module.exports !== 'undefined' ? module.exports : this;");
  const sandbox = {};
  fn(module, module.exports, sandbox, sandbox, DxfParser, XLSX);
  return sandbox;
}

const dxfApi = require(path.join(root, "js/dxf-takeoff.js"));

// excel-io is browser-oriented; eval with XLSX global
const excelSandbox = { XLSX };
new Function("window", "globalThis", "XLSX", fs.readFileSync(path.join(root, "js/excel-io.js"), "utf8"))(excelSandbox, excelSandbox, XLSX);

function parseNumber(v) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  let s = String(v).trim().replace(/\s/g, "");
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    const frac = s.split(",")[1] || "";
    s = frac.length <= 2 ? s.replace(",", ".") : s.replace(/,/g, "");
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const dxfPath = process.argv[2] || "/workspace/picad/job1/v3/BV_PHA_DO_v3.7.dxf";
const xlsxPath = process.argv[3] || "/workspace/picad/job1/v3/BANG_KHOI_LUONG_v3.7.xlsx";

const report = { ok: true, dxf: {}, xlsx: {}, errors: [] };

try {
  const text = fs.readFileSync(dxfPath, "utf8");
  console.log("Parsing DXF", dxfPath, "bytes", text.length);
  const t0 = Date.now();
  const dxf = dxfApi.parseText(text, DxfParser);
  const summary = dxfApi.summarize(dxf, "mm");
  console.log("hatches extracted", dxf._hatchesExtracted);
  console.log("DXF parsed in", Date.now() - t0, "ms");
  console.log("entities", summary.entityCount, "layers", summary.layers.length, "blocks", summary.blocks.length);
  console.log("header unit hint", summary.headerUnit);
  const topLen = [...summary.layers].sort((a, b) => b.lengthM - a.lengthM).slice(0, 8);
  const topArea = [...summary.layers].sort((a, b) => b.areaM2 - a.areaM2).slice(0, 8);
  console.log("\nTop length layers (m):");
  topLen.forEach((L) => console.log(" ", L.layer, "len_m=", L.lengthM.toFixed(2), "area_m2=", L.areaM2.toFixed(2), "n=", L.entityCount));
  console.log("\nTop area layers (m2):");
  topArea.forEach((L) => console.log(" ", L.layer, "area_m2=", L.areaM2.toFixed(2), "len_m=", L.lengthM.toFixed(2), "hatches=", L.hatches));
  console.log("\nTop blocks:");
  summary.blocks.slice(0, 10).forEach((B) => console.log(" ", B.name, B.count));

  const wallPd = summary.layers.find((L) => /WALL-PHA-DO/i.test(L.layer));
  const wallXm = summary.layers.find((L) => /XÂY MỚI|XAY MOI|WALL-X/i.test(L.layer));
  report.dxf = {
    file: dxfPath,
    entities: summary.entityCount,
    layers: summary.layers.length,
    blocks: summary.blocks.length,
    headerUnit: summary.headerUnit,
    wallPd_m: wallPd ? wallPd.lengthM : null,
    wallXm_m: wallXm ? wallXm.lengthM : null,
    topLength: topLen.map((L) => ({ layer: L.layer, m: +L.lengthM.toFixed(2) })),
    topArea: topArea.map((L) => ({ layer: L.layer, m2: +L.areaM2.toFixed(2) })),
    topBlocks: summary.blocks.slice(0, 8).map((B) => ({ name: B.name, count: B.count })),
  };
  if (summary.entityCount < 100) {
    report.ok = false;
    report.errors.push("DXF entity count unexpectedly low");
  }
  if (wallPd && wallPd.lengthM < 10) {
    report.ok = false;
    report.errors.push("0-WALL-PHA-DO length implausibly small");
  }
} catch (e) {
  report.ok = false;
  report.errors.push("DXF: " + e.stack);
  console.error(e);
}

try {
  const wb = XLSX.readFile(xlsxPath);
  const parsed = excelSandbox.PiExcel.parseWorkbook(wb, parseNumber);
  console.log("\nExcel", xlsxPath);
  console.log("sheets:", parsed.sheets);
  console.log("total rows", parsed.rows.length);
  const bySheet = {};
  parsed.rows.forEach((r) => { bySheet[r.hangMuc] = (bySheet[r.hangMuc] || 0) + 1; });
  console.log("rows by hangMuc", bySheet);
  const sample = parsed.rows.slice(0, 5).map((r) => ({ ma: r.ma, noiDung: r.noiDung, kl: r.kl, donVi: r.donVi, hangMuc: r.hangMuc }));
  console.log("sample", sample);
  const klSum = parsed.rows.reduce((s, r) => s + (Number(r.kl) || 0), 0);
  console.log("sum of KL values", klSum.toFixed(2));
  report.xlsx = {
    file: xlsxPath,
    sheets: parsed.sheets,
    totalRows: parsed.rows.length,
    byHangMuc: bySheet,
    sample,
    klSum: +klSum.toFixed(2),
  };
  if (parsed.rows.length < 50) {
    report.ok = false;
    report.errors.push("BKL row count unexpectedly low: " + parsed.rows.length);
  }
} catch (e) {
  report.ok = false;
  report.errors.push("XLSX: " + e.stack);
  console.error(e);
}

fs.writeFileSync(path.join(root, "tests/parse-picad-report.json"), JSON.stringify(report, null, 2));
console.log("\nREPORT ok=", report.ok, report.errors);
process.exit(report.ok ? 0 : 1);
