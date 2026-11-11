"""E2E headless: PDF bảng KL, đo PDF vector 1:100, PDF scan, PNG mặt bằng, chạm trên mobile.
Chạy: python3 tests/media_e2e.py [base_url]"""
import json, sys, subprocess, time, socket
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
FX = ROOT / "tests" / "fixtures"
OUTD = ROOT / "tests" / "out"; OUTD.mkdir(exist_ok=True)
EXP = json.load(open(FX / "expected.json"))
PT = 72 / 25.4  # pt per mm giấy
TOL = 0.01
results, errors = {}, []

def paper(mm_x, mm_y):  # mm giấy (gốc dưới trái) -> pt PDF (gốc trên trái)
    return mm_x * PT, (297 - mm_y) * PT

def check(name, got, exp, tol=TOL):
    ok = got is not None and abs(got - exp) <= abs(exp) * tol
    results[name] = {"got": round(got, 4) if got is not None else None, "expected": exp, "ok": ok}
    if not ok: errors.append(f"{name}: got {got} expected {exp}")

ROUND = {"on": False}
def click_doc(page, u, w, touch=False):
    x, y = page.evaluate("([u,w]) => PiMedia._debug.docToClient(u,w)", [u, w])
    if ROUND["on"]: x, y = round(x), round(y)
    if touch: page.touchscreen.tap(x, y)
    else: page.mouse.click(x, y)
    page.wait_for_timeout(60)

def calibrate(page, a, b, mm, touch=False):
    page.click('[data-mode="calib"]')
    click_doc(page, *a, touch=touch); click_doc(page, *b, touch=touch)
    page.fill("#vCalibMm", str(mm)); page.click("#vCalibOk")
    page.wait_for_timeout(150)

def shape(page, mode, pts, touch=False):
    page.click(f'[data-mode="{mode}"]')
    for p in pts: click_doc(page, *p, touch=touch)
    page.click("#vFinish"); page.wait_for_timeout(100)

def values(page):
    return page.evaluate("PiMedia._debug.values()")

def qty_rows(page):
    return page.evaluate("PiApp.currentProject().qtyRows")

def main(base):
    with sync_playwright() as pw:
        br = pw.chromium.launch(executable_path="/usr/bin/google-chrome-stable", args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = br.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("dialog", lambda d: d.accept())
        page.goto(base, wait_until="networkidle")
        page.fill("#npName", "Thử PDF ảnh"); page.click("#npCreate")
        page.wait_for_selector("#mediaFile", state="attached")
        page.wait_for_function("typeof pdfjsLib !== 'undefined'")
        results["pdfjs_version"] = page.evaluate("pdfjsLib.version")

        # 1) PDF vector: đọc bảng trang 1
        page.set_input_files("#mediaFile", str(FX / "bkl_va_mat_bang.pdf"))
        page.wait_for_selector("#pmPage")
        results["pdf_pages_in_picker"] = page.eval_on_selector_all("#pmPage option", "o => o.length")
        page.click("#pmTable")
        page.wait_for_selector("#tpTable")
        prev = page.eval_on_selector_all("#tpTable tbody tr", "trs => trs.map(t => [t.querySelector('.tpMa').value, t.querySelector('.tpNd').value, t.querySelector('.tpDv').value, t.querySelector('.tpKl').value])")
        results["pdf_preview_rows"] = prev
        exp_rows = EXP["rows"]
        match = len(prev) == len(exp_rows) and all(p[0] == e[0] and p[2] == e[2] and abs(float(p[3].replace(".", "").replace(",", ".")) - e[3]) < 1e-9 for p, e in zip(prev, exp_rows))
        results["pdf_table_match_expected"] = match
        if not match: errors.append("bảng PDF không khớp expected")
        page.screenshot(path=str(OUTD / "pdf-table-preview.png"))
        page.locator(".tpChk").nth(7).uncheck()  # bỏ 1 dòng
        page.click("#tpAdd"); page.wait_for_timeout(200)
        rows = qty_rows(page)
        results["pdf_rows_added"] = len(rows)
        results["pdf_rows_sum_kl"] = round(sum(r["kl"] for r in rows), 2)
        exp_sum = round(sum(r[3] for r in exp_rows[:7]), 2)
        check("pdf_rows_sum_kl_vs_expected", results["pdf_rows_sum_kl"], exp_sum, 1e-9)
        results["pdf_row_source"] = rows[0]["source"]

        # 2) Đo trên trang 2 (mặt bằng 1:100)
        page.click("[data-doc-view]")
        page.wait_for_selector("#pmPage"); page.select_option("#pmPage", "2"); page.click("#pmMeasure")
        page.wait_for_selector("#vCanvas"); page.wait_for_timeout(1200)
        results["pdf_uncalibrated_warning_visible"] = page.is_visible("#vCalibWarn")
        shape(page, "length", [paper(40, 170), paper(140, 170)])
        results["uncalibrated_value"] = values(page)[0]["value"]
        page.click("#vUndo")  # hoàn tác phép đo chưa hiệu chỉnh
        results["after_undo_count"] = len(values(page))
        calibrate(page, paper(40, 180), paper(140, 180), 10000)
        results["pdf_warning_hidden_after_calib"] = not page.is_visible("#vCalibWarn")
        shape(page, "length", [paper(40, 170), paper(140, 170), paper(140, 120)])  # 10 m + 5 m
        shape(page, "area", [paper(40, 120), paper(140, 120), paper(140, 170), paper(40, 170)])
        shape(page, "count", [paper(60, 100), paper(90, 100), paper(120, 100)])
        v = values(page)
        check("pdf_length_m (exp 15)", v[0]["value"], 15.0)
        check("pdf_area_m2 (exp 50)", v[1]["value"], 50.0)
        check("pdf_count (exp 3)", v[2]["value"], 3, 0)
        # zoom rồi đo lại cạnh 5 m cho chính xác hơn
        page.click("#vZin"); page.click("#vZin"); page.wait_for_timeout(100)
        shape(page, "length", [paper(140, 170), paper(140, 120)])
        check("pdf_length_zoomed_m (exp 5)", values(page)[3]["value"], 5.0)
        # click làm tròn pixel ở mức vừa khung (sai số kiểu người bấm)
        page.click("#vFit"); ROUND["on"] = True
        shape(page, "length", [paper(40, 120), paper(140, 120)])
        ROUND["on"] = False
        check("pdf_length_pixel_rounded_m (exp 10, tol 1%)", values(page)[4]["value"], 10.0)
        page.screenshot(path=str(OUTD / "viewer-pdf.png"))
        page.click("#vAdd"); page.wait_for_timeout(200)
        rows = qty_rows(page)
        meas = [r for r in rows if r["source"].endswith("tr.2")]
        results["pdf_measure_rows"] = [[r["noiDung"], r["donVi"], r["kl"], r["source"]] for r in meas]
        page.click("[data-close]")

        # 3) PDF scan
        page.set_input_files("#mediaFile", str(FX / "scan.pdf"))
        page.wait_for_selector("#pmTable"); page.click("#pmTable")
        page.wait_for_selector("#scanNote")
        results["scan_note"] = page.inner_text("#scanNote").split(".")[0]
        page.click("[data-close]")

        # 4) PNG: mở thẳng trình đo; 1 px = 10 mm
        page.set_input_files("#mediaFile", str(FX / "mat_bang.png"))
        page.wait_for_selector("#vCanvas"); page.wait_for_timeout(500)
        results["png_uncalibrated_warning_visible"] = page.is_visible("#vCalibWarn")
        calibrate(page, (300, 1000), (800, 1000), 5000)
        shape(page, "length", [(300, 300), (900, 300)])
        shape(page, "area", [(300, 300), (900, 300), (900, 700), (300, 700)])
        v = values(page)
        check("png_length_m (exp 6)", v[0]["value"], 6.0)
        check("png_area_m2 (exp 24)", v[1]["value"], 24.0)
        # xoá 1 phép đo bằng nút Xóa
        page.locator("[data-ms-del]").nth(0).click(); page.wait_for_timeout(100)
        results["png_after_delete"] = len(values(page))
        page.click("[data-close]")
        page.wait_for_timeout(300)
        results["doc_list_count"] = page.eval_on_selector_all("[data-doc-view]", "b => b.length")
        page.screenshot(path=str(ROOT / "screenshot.png"), full_page=False)

        # 5) Mobile + chạm: dữ liệu IndexedDB còn sau khi tải lại
        m = br.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True, device_scale_factor=2)
        mp = m.new_page(); mp.on("dialog", lambda d: d.accept())
        mp.on("pageerror", lambda e: errors.append("mobile pageerror: " + str(e)))
        mp.goto(base, wait_until="networkidle")
        mp.fill("#npName", "Mobile"); mp.click("#npCreate")
        mp.set_input_files("#mediaFile", str(FX / "mat_bang.png"))
        mp.wait_for_selector("#vCanvas"); mp.wait_for_timeout(500)
        calibrate(mp, (300, 1000), (800, 1000), 5000, touch=True)
        shape(mp, "count", [(300, 300), (900, 300), (900, 700), (300, 700)], touch=True)
        shape(mp, "length", [(300, 300), (900, 300)], touch=True)
        mv = mp.evaluate("PiMedia._debug.values()")
        check("mobile_touch_count (exp 4)", mv[0]["value"], 4, 0)
        check("mobile_touch_length_m (exp 6)", mv[1]["value"], 6.0, 0.02)
        mp.screenshot(path=str(OUTD / "viewer-mobile.png"))
        mp.reload(wait_until="networkidle")
        mp.click('nav.tabs button[data-view="qty"]'); mp.wait_for_timeout(800)
        results["mobile_docs_after_reload"] = mp.eval_on_selector_all("[data-doc-view]", "b => b.length")
        br.close()

    results["errors"] = errors
    print(json.dumps(results, ensure_ascii=False, indent=1))
    json.dump(results, open(OUTD / "media-e2e.json", "w"), ensure_ascii=False, indent=1)
    return 1 if errors else 0

if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else None
    srv = None
    if not base:
        srv = subprocess.Popen([sys.executable, "-m", "http.server", "8766", "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(50):
            try: socket.create_connection(("127.0.0.1", 8766), 0.2).close(); break
            except OSError: time.sleep(0.1)
        base = "http://127.0.0.1:8766/"
    try: code = main(base)
    finally:
        if srv: srv.terminate()
    sys.exit(code)
