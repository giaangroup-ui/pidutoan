"""Icon PiDự toán theo phong cách "Pi" của PiCAD: nền xanh đậm, lưới, khung vàng, chữ Pi trắng; thêm các dòng bảng dự toán."""
from PIL import Image, ImageDraw, ImageFont
import os
BG=(14,22,33); GRID=(30,52,76); BLUE=(61,158,229); GOLD=(232,195,106); WHITE=(255,255,255)
def font(sz):
    for f in ["/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(f): return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
def draw(size, maskable=False, out=None):
    S=size*4; im=Image.new("RGB",(S,S),BG); d=ImageDraw.Draw(im)
    pad = int(S*0.0) if maskable else int(S*0.04)
    inner = int(S*0.18) if maskable else int(S*0.08)   # vùng an toàn maskable ~80%
    step=S//12
    for i in range(0,S,step):
        d.line([(i,0),(i,S)],fill=GRID,width=max(1,S//256)); d.line([(0,i),(S,i)],fill=GRID,width=max(1,S//256))
    if not maskable:
        d.rounded_rectangle([pad,pad,S-pad,S-pad],radius=S//8,outline=BLUE,width=S//64)
    x0,y0,x1,y1=inner+S*0.06, inner+S*0.1, S-inner-S*0.06, S-inner-S*0.06
    w=S//48
    d.rectangle([x0,y0,x1,y1],outline=GOLD,width=w)            # tờ bảng dự toán
    hy=y0+(y1-y0)*0.22
    d.line([(x0,hy),(x1,hy)],fill=GOLD,width=w//2)
    for k in (0.62,0.74,0.86):
        yy=y0+(y1-y0)*k; d.line([(x0+w*2,yy),(x1-w*2,yy)],fill=BLUE,width=max(2,w//2))
    cx=x0+(x1-x0)*0.72; d.line([(cx,y0+(y1-y0)*0.56),(cx,y1)],fill=GOLD,width=w//3)
    f=font(int((y1-y0)*0.34)); t="Pi"
    bb=d.textbbox((0,0),t,font=f); tw=bb[2]-bb[0]; th=bb[3]-bb[1]
    d.text(((x0+x1)/2-tw/2-bb[0], y0+(y1-y0)*0.40-th/2-bb[1]),t,fill=WHITE,font=f)
    d.rectangle([(x0+x1)/2-S*0.08,y1+S*0.015,(x0+x1)/2+S*0.08,y1+S*0.035],fill=BLUE)
    im=im.resize((size,size),Image.LANCZOS); im.save(out); print(out)
draw(192,False,"icons/icon-192.png"); draw(512,False,"icons/icon-512.png")
draw(192,True,"icons/maskable-192.png"); draw(512,True,"icons/maskable-512.png")
draw(180,False,"icons/apple-touch-icon.png")
