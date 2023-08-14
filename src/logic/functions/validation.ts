import { ContentType } from "@typing/enums/content";

export function validateContentType(contentType: string) {
  if (contentType.includes(ContentType.ApplicationJson)) {
    return {
      json: true,
      file: false,
    };
  }

  const isFile = contentType.includes(ContentType.ApplicationOctetStream)
    || contentType.includes(ContentType.ApplicationZip)
    || contentType.includes(ContentType.ApplicationPdf);
  const isImage = contentType.includes(ContentType.ImageJpeg)
    || contentType.includes(ContentType.ImagePng)
    || contentType.includes(ContentType.ImageGif)
    || contentType.includes(ContentType.ImageWebp)
    || contentType.includes(ContentType.ImageSvgXml);
  const isAudio = contentType.includes(ContentType.AudioMpeg)
    || contentType.includes(ContentType.AudioOgg)
    || contentType.includes(ContentType.AudioWav);
  const isVideo = contentType.includes(ContentType.VideoMp4)
    || contentType.includes(ContentType.VideoWebm)
    || contentType.includes(ContentType.VideoOgg);

  if (isFile || isImage || isAudio || isVideo) {
    return {
      json: false,
      file: true,
    };
  }

  return {
    json: false,
    file: false,
  };
}
