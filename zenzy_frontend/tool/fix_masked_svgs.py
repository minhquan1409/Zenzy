"""Sửa các SVG xuất từ Figma dùng mẹo "stroke mask" để flutter_svg vẽ đủ nét.

Figma xuất nét viền trong (inside stroke) thành: <mask> chứa hình gốc + một <path id="Glyph">
gộp MỌI nét của icon và gắn mask đó. Theo đúng chuẩn SVG, phần nét nằm ngoài hình trong mask
(ví dụ cán kính lúp) bị ẩn mất. Script này tách path Glyph thành hai path: các nét có chạm vào
hình trong mask thì giữ mask, các nét nằm hẳn bên ngoài thì bỏ mask. Hình học không đổi.

Chạy lại sau khi copy SVG mới từ Figma:  python tool/fix_masked_svgs.py
(An toàn khi chạy nhiều lần: file đã sửa sẽ được bỏ qua.)
"""
import glob
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'svg')
TOKEN = re.compile(r'[MLHVCZmlhvcz]|-?\d*\.?\d+(?:[eE][-+]?\d+)?')
ARGS = {'M': 2, 'L': 2, 'H': 1, 'V': 1, 'C': 6, 'Z': 0}


def subpaths(d):
    """Tách path thành các subpath: [(chuỗi d, [điểm lấy mẫu])]."""
    tokens = TOKEN.findall(d)
    out, i, cur, start, cmd = [], 0, (0.0, 0.0), (0.0, 0.0), None
    text, points = [], []
    while i < len(tokens):
        if tokens[i].isalpha():
            cmd = tokens[i]
            i += 1
        if cmd is None or cmd.upper() not in ARGS:
            raise ValueError('lệnh path chưa hỗ trợ: %r' % cmd)
        rel = cmd.islower()
        n = ARGS[cmd.upper()]
        nums = [float(t) for t in tokens[i:i + n]]
        i += n
        up = cmd.upper()
        if up == 'M':
            if text:
                out.append((' '.join(text), points))
            text, points = [], []
        prev = cur
        if up in 'ML':
            cur = (nums[0] + (prev[0] if rel else 0), nums[1] + (prev[1] if rel else 0))
            if up == 'M':
                start = cur
        elif up == 'H':
            cur = (nums[0] + (prev[0] if rel else 0), prev[1])
        elif up == 'V':
            cur = (prev[0], nums[0] + (prev[1] if rel else 0))
        elif up == 'C':
            ctrl = [(nums[k] + (prev[0] if rel else 0), nums[k + 1] + (prev[1] if rel else 0)) for k in (0, 2, 4)]
            p0, (p1, p2, p3) = prev, ctrl
            for s in range(1, 12):  # lấy mẫu dọc đường cong
                t = s / 12
                a, b, c, e = (1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3
                points.append((a * p0[0] + b * p1[0] + c * p2[0] + e * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + e * p3[1]))
            cur = p3
        elif up == 'Z':
            cur = start
        points.append(cur)
        text.append(cmd + ' '.join('%g' % v for v in nums))
        if up == 'M':
            cmd = 'l' if rel else 'L'  # các cặp toạ độ tiếp theo là lineto
    if text:
        out.append((' '.join(text), points))
    return out


def inside(point, polygon, eps=0.25):
    """Điểm nằm trong đa giác và cách biên hơn eps."""
    x, y = point
    hit = False
    near = False
    for (x1, y1), (x2, y2) in zip(polygon, polygon[1:] + polygon[:1]):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            hit = not hit
        dx, dy = x2 - x1, y2 - y1
        t = 0 if dx == dy == 0 else max(0, min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
        if (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 < eps * eps:
            near = True
    return hit and not near


def fix(svg):
    changed = False
    for mask in re.finditer(r'<mask id="(stroke[^"]+)"[^>]*>(.*?)</mask>', svg, re.S):
        mask_id = mask.group(1)
        polygons = [pts for d in re.findall(r'\sd="([^"]+)"', mask.group(2)) for _, pts in subpaths(d)]
        pattern = re.compile(r'<path([^>]*?)\sd="([^"]+)"([^>]*?)\smask="url\(#%s\)"([^>]*?)/>' % re.escape(mask_id))
        glyph = pattern.search(svg)
        if not glyph:
            continue
        before, d, mid, after = glyph.groups()
        keep, free = [], []
        for text, pts in subpaths(d):
            touches = any(inside(p, poly) for p in pts for poly in polygons)
            (keep if touches else free).append(text)
        if not free:
            continue
        attrs = re.sub(r'\sid="[^"]*"', '', before + mid + after)
        parts = []
        if keep:
            parts.append('<path%s d="%s" mask="url(#%s)"/>' % (attrs, ' '.join(keep), mask_id))
        parts.append('<path%s d="%s"/>' % (attrs, ' '.join(free)))
        svg = svg[:glyph.start()] + '\n'.join(parts) + svg[glyph.end():]
        changed = True
    return svg, changed


def main():
    for path in sorted(glob.glob(os.path.join(ROOT, '**', '*.svg'), recursive=True)):
        with open(path, encoding='utf-8') as f:
            svg = f.read()
        if '<mask' not in svg:
            continue
        fixed, changed = fix(svg)
        name = os.path.relpath(path, ROOT).replace(os.sep, '/')
        if changed:
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                f.write(fixed)
        print('%-32s %s' % (name, 'fixed' if changed else 'unchanged'))


if __name__ == '__main__':
    main()
