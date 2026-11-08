# Cuts the Canva-generated hand photo into engine/assets/hand-phone.png: transparent where the white
# studio background and the green screen were, so an app screen can sit behind the thumb.
#   python engine/tools/make_hand_asset.py <exported png>
# Prints the screen's box, which HAND_SCREEN in forge_engine/render.py uses.
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

im = np.asarray(Image.open(sys.argv[1]).convert('RGB')).astype(float)
r, g, b = im[..., 0], im[..., 1], im[..., 2]

# The green screen, soft at the edges so the thumb doesn't get a hard outline
greenness = g - np.maximum(r, b)
screen = np.clip((greenness - 25) / 60, 0, 1)

# White background: only what connects to the image border, so highlights on the skin stay
near_white = (im.min(axis=2) > 232)
labels, _ = ndimage.label(near_white)
edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
bg = np.isin(labels, edge[edge > 0])
bg = ndimage.binary_dilation(bg, iterations=2)  # removes the pale halo around the hand

alpha = 1 - np.maximum(screen, bg.astype(float))
alpha = np.asarray(Image.fromarray((alpha * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8))).astype(float)

# Remove green spill on the thumb's edge
spill = g > np.maximum(r, b)
out = im.copy()
out[..., 1] = np.where(spill, np.maximum(r, b), g)

rgba = np.dstack([out, alpha]).astype('uint8')
import os
Image.fromarray(rgba, 'RGBA').save(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'hand-phone.png'))
ys, xs = np.where(screen > .9)
print('size', im.shape[1], im.shape[0], 'screen box', xs.min(), ys.min(), xs.max(), ys.max())
