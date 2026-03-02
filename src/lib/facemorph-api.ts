export const FACEMORPH_API = 'https://api.facemorph.me';
export const VIDEO_DIM = 512;
export const IMG_DIM = 300;
export const NUM_MORPH_FRAMES = 25;

export interface EncodeResult {
  guid: string;
  didAlign: boolean;
}

export async function encodeImage(imageBlob: Blob): Promise<EncodeResult> {
  const formData = new FormData();
  formData.append('usrimg', imageBlob);
  formData.append('tryalign', 'true');

  const response = await fetch(`${FACEMORPH_API}/api/encodeimage/`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(
      `Failed to encode image: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return { guid: data.guid, didAlign: data.did_align };
}

export function getMorphFrameUrl(
  fromGuid: string,
  toGuid: string,
  dim: number,
  numFrames: number,
  frameNum: number
): string {
  return `${FACEMORPH_API}/api/morphframe/?dim=${dim}&linear=true&from_guid=${fromGuid}&to_guid=${toGuid}&num_frames=${numFrames}&frame_num=${frameNum}`;
}

export function getMp4Url(
  fromGuid: string,
  toGuid: string,
  dim: number = VIDEO_DIM
): string {
  return `${FACEMORPH_API}/api/mp4/?dim=${dim}&from_guid=${fromGuid}&to_guid=${toGuid}`;
}

export function getFaceUrl(
  guid: string,
  dim: number = VIDEO_DIM,
  format: string = 'jpeg'
): string {
  return `${FACEMORPH_API}/api/face/?dim=${dim}&guid=${guid}&format=${format}`;
}
