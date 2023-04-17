export enum ContentType {
  // Text types
  TextPlain = "text/plain",
  TextHtml = "text/html",
  TextCss = "text/css",
  TextJavascript = "text/javascript",
  TextCsv = "text/csv",

  // Application types
  ApplicationJson = "application/json",
  ApplicationFormUrlencoded = "application/x-www-form-urlencoded",
  ApplicationFormData = "multipart/form-data",

  // XML types
  ApplicationXml = "application/xml",
  TextXml = "text/xml",

  // Binary types
  ApplicationOctetStream = "application/octet-stream",
  ApplicationPdf = "application/pdf",
  ApplicationZip = "application/zip",

  // Image types
  ImageJpeg = "image/jpeg",
  ImagePng = "image/png",
  ImageGif = "image/gif",
  ImageSvgXml = "image/svg+xml",
  ImageWebp = "image/webp",

  // Audio types
  AudioMpeg = "audio/mpeg",
  AudioOgg = "audio/ogg",
  AudioWav = "audio/wav",

  // Video types
  VideoMp4 = "video/mp4",
  VideoWebm = "video/webm",
  VideoOgg = "video/ogg",
}
