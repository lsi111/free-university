"""Tiny SVG helper following docs/AUTHORING.md figure rules."""
import math, os

BG = '#f4efe6'; T = '#1d1c1a'; G = '#2f5d50'; O = '#e07a3f'; M = '#7a766d'; GRID = '#ddd5c6'; W_ = '#ffffff'


class Fig:
    def __init__(self, w, h):
        self.w, self.h, self.parts = w, h, []

    def add(self, s):
        self.parts.append(s); return self

    def text(self, x, y, s, size=12, anchor='start', fill=T, weight=None):
        wt = f' font-weight="{weight}"' if weight else ''
        s = str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
        return self.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="sans-serif" font-size="{size}" fill="{fill}" text-anchor="{anchor}"{wt}>{s}</text>')

    def line(self, x1, y1, x2, y2, stroke=T, width=1.5, dash=None):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        return self.add(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def arrow(self, x1, y1, x2, y2, stroke=T, width=2, head=8):
        self.line(x1, y1, x2, y2, stroke, width)
        a = math.atan2(y2 - y1, x2 - x1)
        p1 = (x2 - head * math.cos(a - 0.4), y2 - head * math.sin(a - 0.4))
        p2 = (x2 - head * math.cos(a + 0.4), y2 - head * math.sin(a + 0.4))
        return self.add(f'<polygon points="{x2:.1f},{y2:.1f} {p1[0]:.1f},{p1[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}" fill="{stroke}"/>')

    def rect(self, x, y, w, h, fill=W_, stroke=T, width=1.5, rx=4, opacity=None):
        op = f' fill-opacity="{opacity}"' if opacity is not None else ''
        return self.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}"{op} stroke="{stroke}" stroke-width="{width}"/>')

    def circle(self, cx, cy, r, fill=G, stroke='none', width=1.5):
        return self.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"/>')

    def poly(self, pts, stroke=G, width=2.5, fill='none', dash=None, closed=False, opacity=None):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        op = f' fill-opacity="{opacity}"' if opacity is not None else ''
        tag = 'polygon' if closed else 'polyline'
        p = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        return self.add(f'<{tag} points="{p}" fill="{fill}"{op} stroke="{stroke}" stroke-width="{width}"{d}/>')

    def box(self, x, y, w, h, label, fill=W_, stroke=G, size=12, sub=None):
        self.rect(x, y, w, h, fill=fill, stroke=stroke, width=2)
        if sub:
            self.text(x + w / 2, y + h / 2 - 2, label, size, 'middle')
            self.text(x + w / 2, y + h / 2 + size, sub, size - 1, 'middle', M)
        else:
            self.text(x + w / 2, y + h / 2 + size * 0.35, label, size, 'middle')
        return self

    def save(self, path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        body = '\n'.join(self.parts)
        with open(path, 'w', encoding='utf8') as f:
            f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" height="{self.h}">\n<rect width="{self.w}" height="{self.h}" fill="{BG}"/>\n{body}\n</svg>\n')


class Axes:
    """Data->pixel mapping with axes, ticks and grid."""
    def __init__(self, fig, x0, y0, x1, y1, xr, yr):
        self.f, self.px, self.xr, self.yr = fig, (x0, y0, x1, y1), xr, yr

    def P(self, x, y):
        x0, y0, x1, y1 = self.px
        return (x0 + (x - self.xr[0]) / (self.xr[1] - self.xr[0]) * (x1 - x0),
                y1 - (y - self.yr[0]) / (self.yr[1] - self.yr[0]) * (y1 - y0))

    def draw(self, xticks=(), yticks=(), xlabel=None, ylabel=None, grid=True, fmt=str):
        x0, y0, x1, y1 = self.px
        f = self.f
        if grid:
            for t in xticks:
                X, _ = self.P(t, 0); f.line(X, y0, X, y1, GRID, 1)
            for t in yticks:
                _, Y = self.P(0, t); f.line(x0, Y, x1, Y, GRID, 1)
        f.line(x0, y1, x1, y1, M, 1.5); f.line(x0, y0, x0, y1, M, 1.5)
        for t in xticks:
            X, _ = self.P(t, 0); f.text(X, y1 + 15, fmt(t), 11, 'middle', M)
        for t in yticks:
            _, Y = self.P(0, t); f.text(x0 - 6, Y + 4, fmt(t), 11, 'end', M)
        if xlabel: f.text(x1, y1 + 30, xlabel, 11, 'end', M)
        if ylabel: f.text(x0 + 4, y0 - 6, ylabel, 11, 'start', M)
        return self

    def curve(self, fn, a, b, n=120, **kw):
        pts = []
        for i in range(n + 1):
            x = a + (b - a) * i / n
            y = fn(x)
            if y is None or y < self.yr[0] - 1e-9 or y > self.yr[1] + 1e-9: continue
            pts.append(self.P(x, y))
        return self.f.poly(pts, **kw)

    def pts(self, data, **kw):
        return self.f.poly([self.P(x, y) for x, y in data], **kw)

    def dot(self, x, y, r=4, fill=O):
        X, Y = self.P(x, y); return self.f.circle(X, Y, r, fill)


def resistor(f, x1, y1, x2, y2, label=None, lx=0, ly=0, stroke=T):
    """Zigzag resistor between two points (horizontal or vertical)."""
    import math
    L = math.hypot(x2 - x1, y2 - y1); ux, uy = (x2 - x1) / L, (y2 - y1) / L; px, py = -uy, ux
    lead = (L - 36) / 2
    pts = [(x1, y1), (x1 + ux * lead, y1 + uy * lead)]
    for i in range(6):
        t = lead + 3 + i * 6
        s = 6 if i % 2 == 0 else -6
        pts.append((x1 + ux * t + px * s, y1 + uy * t + py * s))
    pts += [(x1 + ux * (L - lead), y1 + uy * (L - lead)), (x2, y2)]
    f.poly(pts, stroke=stroke, width=2)
    if label:
        f.text((x1 + x2) / 2 + lx, (y1 + y2) / 2 + ly, label, 12, 'middle', T, 'bold')


def battery(f, x, y1, y2, label=None):
    """Vertical DC source between y1 (top, +) and y2 (bottom)."""
    my = (y1 + y2) / 2
    f.line(x, y1, x, my - 6, T, 2); f.line(x, my + 6, x, y2, T, 2)
    f.line(x - 14, my - 6, x + 14, my - 6, T, 2.5); f.line(x - 8, my + 6, x + 8, my + 6, T, 2.5)
    f.text(x + 18, my - 4, '+', 12, 'start', T, 'bold')
    if label: f.text(x - 18, my + 4, label, 12, 'end', T, 'bold')
