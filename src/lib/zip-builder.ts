import JSZip from 'jszip';
import { triggerDownload, base64ToBlob } from './image-utils';

export async function downloadFramesZip(frameUrls: string[]) {
  const zip = new JSZip();
  const folder = zip.folder('morph-frames')!;

  for (let i = 0; i < frameUrls.length; i++) {
    const url = frameUrls[i];
    let blob: Blob;

    if (url.startsWith('data:')) {
      // Data URL (local morph)
      const [header, data] = url.split(',');
      const mime = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      blob = base64ToBlob(data, mime);
    } else {
      // Remote URL (facemorph.me API)
      const res = await fetch(url);
      blob = await res.blob();
    }

    folder.file(`frame-${String(i).padStart(2, '0')}.jpg`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, 'morph-frames.zip');
}

export async function downloadEverythingZip(
  originalFile: File,
  modifiedBase64: string,
  frameUrls: string[],
  mp4Url?: string
) {
  const zip = new JSZip();

  // Original
  zip.file(`original.${originalFile.name.split('.').pop() || 'jpg'}`, originalFile);

  // Modified
  const modBlob = base64ToBlob(modifiedBase64, 'image/png');
  zip.file('modified.png', modBlob);

  // Frames
  const framesFolder = zip.folder('morph-frames')!;
  for (let i = 0; i < frameUrls.length; i++) {
    const url = frameUrls[i];
    let blob: Blob;

    if (url.startsWith('data:')) {
      const [header, data] = url.split(',');
      const mime = header.match(/data:(.*?);/)?.[1] || 'image/jpeg';
      blob = base64ToBlob(data, mime);
    } else {
      const res = await fetch(url);
      blob = await res.blob();
    }

    framesFolder.file(`frame-${String(i).padStart(2, '0')}.jpg`, blob);
  }

  // MP4 (if available from API mode)
  if (mp4Url) {
    const mp4Res = await fetch(mp4Url);
    const mp4Blob = await mp4Res.blob();
    zip.file('morph-video.mp4', mp4Blob);
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, 'skin-tone-research-bundle.zip');
}
