"""Tạo file thử cho PDF/ảnh: bảng KL (lấy số thật từ BKL v3.7), mặt bằng vector 1:100, PDF scan, PNG mặt bằng."""
import json, sys
from pathlib import Path
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import Rectangle, Circle
import openpyxl

matplotlib.rcParams["pdf.fonttype"] = 42
matplotlib.rcParams["font.family"] = "DejaVu Sans"
OUT = Path(__file__).parent / "fixtures"
OUT.mkdir(exist_ok=True)
BKL = sys.argv[1] if len(sys.argv) > 1 else "/workspace/picad/job1/v3/BANG_KHOI_LUONG_v3.7.xlsx"

# --- lấy 8 dòng thật từ PD-02 ---
wb = openpyxl.load_workbook(BKL, data_only=True)
ws = wb["PD-02"]
rows = []
for r in ws.iter_rows(min_row=7, values_only=True):
    ma, nd, vt, L, day, H = r[:6]
    if not ma or not L or not H or str(ma).upper().startswith("TỔNG"):
        continue
    kl = round(L * H / 1e6, 2)
    rows.append((ma, nd, "m²", kl))
    if len(rows) == 8:
        break
A4 = (8.27, 11.69)

def vn(n):
    return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

with PdfPages(OUT / "bkl_va_mat_bang.pdf") as pdf:
    # Trang 1: bảng
    fig = plt.figure(figsize=A4)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 210); ax.set_ylim(0, 297); ax.axis("off")
    ax.text(15, 280, "BẢNG KHỐI LƯỢNG PHÁ DỠ - TẦNG 1 (trích PD-02)", fontsize=12, weight="bold")
    cols = [(15, "Mã"), (45, "Nội dung công tác"), (150, "ĐV"), (175, "KL")]
    y = 265
    for x, t in cols:
        ax.text(x, y, t, fontsize=9, weight="bold")
    ax.plot([15, 195], [y - 2.5, y - 2.5], color="k", lw=0.8)
    total = 0
    for ma, nd, dv, kl in rows:
        y -= 7
        ax.text(15, y, ma, fontsize=8); ax.text(45, y, nd, fontsize=8); ax.text(150, y, dv, fontsize=8)
        ax.text(190, y, vn(kl), fontsize=8, ha="right")
        total += kl
    y -= 7
    ax.plot([15, 195], [y + 4.5, y + 4.5], color="k", lw=0.5)
    ax.text(15, y, "TỔNG", fontsize=8, weight="bold"); ax.text(190, y, vn(total), fontsize=8, ha="right", weight="bold")
    pdf.savefig(fig); plt.close(fig)

    # Trang 2: mặt bằng 1:100 — HCN 10000 x 5000 mm = 100 x 50 mm giấy
    fig = plt.figure(figsize=A4)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 210); ax.set_ylim(0, 297); ax.axis("off")
    ax.add_patch(Rectangle((40, 120), 100, 50, fill=False, lw=1.2))
    ax.plot([40, 140], [180, 180], color="k", lw=0.6)
    for x in (40, 140):
        ax.plot([x, x], [177, 183], color="k", lw=0.6)
    ax.text(90, 182, "10000", ha="center", fontsize=8)
    for x in (60, 90, 120):
        ax.add_patch(Circle((x, 100), 3, fill=False, lw=0.8))
    ax.text(15, 280, "MẶT BẰNG THỬ - TỶ LỆ 1:100", fontsize=11, weight="bold")
    pdf.savefig(fig); plt.close(fig)

# PNG mặt bằng: 1 px = 10 mm
fig = plt.figure(figsize=(20, 14), dpi=100)
ax = fig.add_axes([0, 0, 1, 1]); ax.set_xlim(0, 2000); ax.set_ylim(1400, 0); ax.axis("off")
ax.add_patch(Rectangle((300, 300), 600, 400, fill=False, lw=3))
ax.plot([300, 800], [1000, 1000], color="k", lw=3)
ax.text(550, 980, "5000 mm", ha="center", fontsize=20)
fig.savefig(OUT / "mat_bang.png", dpi=100, facecolor="white"); plt.close(fig)

# PDF scan: chỉ có ảnh, không có lớp chữ
img = plt.imread(OUT / "mat_bang.png")
fig = plt.figure(figsize=A4)
ax = fig.add_axes([0, 0, 1, 1]); ax.imshow(img); ax.axis("off")
fig.savefig(OUT / "scan.pdf"); plt.close(fig)

json.dump({"rows": [list(r) for r in rows], "total": round(total, 2)}, open(OUT / "expected.json", "w"), ensure_ascii=False, indent=1)
print("rows", rows, "total", round(total, 2))
