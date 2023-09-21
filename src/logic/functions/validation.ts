import { ContentType } from "../typing/enums/content";

export function validateContentType(contentType: string) {
  if (contentType.includes(ContentType.ApplicationJson)) {
    return {
      json: true,
      file: false,
      text: false,
      xml: false,
    };
  }

  const isText = contentType.includes(ContentType.TextPlain)
    || contentType.includes(ContentType.TextHtml)
    || contentType.includes(ContentType.TextCss)
    || contentType.includes(ContentType.TextJavascript)
    || contentType.includes(ContentType.TextCsv);

  const isXml = contentType.includes(ContentType.ApplicationXml)
    || contentType.includes(ContentType.TextXml);

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

  if (isXml) {
    return {
      json: false,
      file: false,
      text: false,
      xml: true,
    };
  }

  if (isText) {
    return {
      json: false,
      file: false,
      text: true,
      xml: false,
    };
  }

  if (isFile || isImage || isAudio || isVideo) {
    return {
      json: false,
      file: true,
      text: false,
      xml: false,
    };
  }

  return {
    json: false,
    file: false,
    text: false,
    xml: false,
  };
}
