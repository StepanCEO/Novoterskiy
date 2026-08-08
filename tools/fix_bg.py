from PIL import Image
import numpy as np
from collections import deque

def remove_dark_bg(path, threshold=48):
    img = Image.open(path).convert('RGBA')
    d = np.array(img, dtype=np.uint8)
    h, w = d.shape[:2]

    dark = (d[:,:,0]<threshold) & (d[:,:,1]<threshold) & (d[:,:,2]<threshold)
    vis = np.zeros((h, w), bool)
    q = deque()

    for x in range(w):
        for y in [0, h-1]:
            if dark[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in [0, w-1]:
            if dark[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((-1,0),(1,0),(0,-1),(0,1)):
            ny, nx = y+dy, x+dx
            if 0<=ny<h and 0<=nx<w and not vis[ny,nx] and dark[ny,nx]:
                vis[ny,nx] = True
                q.append((ny,nx))

    # Мягкое растушевывание краёв — убирает тёмный ореол
    adj = np.zeros((h, w), bool)
    for dy, dx in ((-1,0),(1,0),(0,-1),(0,1)):
        adj |= np.roll(np.roll(vis, dy, axis=0), dx, axis=1)
    halo = adj & (~vis) & (d[:,:,0]<90) & (d[:,:,1]<90) & (d[:,:,2]<90)
    brightness = d[:,:,0].astype(int) + d[:,:,1].astype(int) + d[:,:,2].astype(int)
    d[halo, 3] = np.clip(brightness[halo] / 270 * 255, 0, 255).astype(np.uint8)
    d[vis,  3] = 0

    Image.fromarray(d).save(path, format='WEBP', quality=92, method=4)
    return int(vis.sum()), (h, w)

base = 'assets/products/'
for suffix in ['', '-2', '-3', '-4', '-5', '-6']:
    p = base + 'pityevaya-pet-033' + suffix + '.webp'
    n, size = remove_dark_bg(p)
    total = size[0] * size[1]
    pct = n / total * 100
    print(f'{p}: removed {n}/{total} px ({pct:.1f}%)')
