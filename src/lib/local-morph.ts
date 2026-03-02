/**
 * Local morph engine: pixel-level cross-dissolve.
 *
 * Since both images are the same person/pose/expression (Gemini only changes
 * skin tone), a simple alpha blend between the two produces smooth,
 * natural-looking morph frames with zero artifacts.
 */

const MORPH_MAX_DIM = 512;

export async function generateCrossDissolveFrames(
  originalSrc: string,
  modifiedSrc: string,
  numFrames: number = 25,
  onProgress?: (frameIndex: number) => void
): Promise<string[]> {
  const [img1, img2] = await Promise.all([
    loadImg(originalSrc),
    loadImg(modifiedSrc),
  ]);

  const { width, height } = getBoundedDimensions(
    img1.naturalWidth,
    img1.naturalHeight,
    MORPH_MAX_DIM
  );

  // Draw both images to same dimensions without aspect-ratio distortion.
  const data1 = getPixels(img1, width, height);
  const data2 = getPixels(img2, width, height);

  const outCanvas = document.createElement('canvas');
  outCanvas.width = width;
  outCanvas.height = height;
  const outCtx = outCanvas.getContext('2d')!;

  const frames: string[] = [];

  for (let i = 0; i < numFrames; i++) {
    const t = numFrames === 1 ? 0 : i / (numFrames - 1);

    // Lerp every pixel
    const out = new ImageData(width, height);
    const len = data1.data.length;
    for (let j = 0; j < len; j++) {
      out.data[j] = Math.round(data1.data[j] * (1 - t) + data2.data[j] * t);
    }

    outCtx.putImageData(out, 0, 0);
    frames.push(outCanvas.toDataURL('image/jpeg', 0.92));
    onProgress?.(i);

    // Yield to prevent UI blocking
    if (i % 5 === 0) await new Promise((r) => setTimeout(r, 0));
  }

  return frames;
}

// --- helpers ---

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getPixels(img: HTMLImageElement, w: number, h: number): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  drawImageCover(ctx, img, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function getBoundedDimensions(
  width: number,
  height: number,
  maxDim: number
): { width: number; height: number } {
  if (!width || !height) {
    return { width: maxDim, height: maxDim };
  }

  const scale = Math.min(maxDim / width, maxDim / height, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  targetWidth: number,
  targetHeight: number
): void {
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const targetAspect = targetWidth / targetHeight;

  let srcWidth = img.naturalWidth;
  let srcHeight = img.naturalHeight;
  let srcX = 0;
  let srcY = 0;

  if (imgAspect > targetAspect) {
    srcWidth = Math.round(img.naturalHeight * targetAspect);
    srcX = Math.round((img.naturalWidth - srcWidth) / 2);
  } else if (imgAspect < targetAspect) {
    srcHeight = Math.round(img.naturalWidth / targetAspect);
    srcY = Math.round((img.naturalHeight - srcHeight) / 2);
  }

  ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, targetWidth, targetHeight);
}
