// biome-ignore lint/style/useNamingConvention: const-object stand-in for an enum (noEnum); PascalCase is the public api
const ContentType = {
	// Text types
	TEXT_PLAIN: "text/plain",
	TEXT_HTML: "text/html",
	TEXT_CSS: "text/css",
	TEXT_JAVASCRIPT: "text/javascript",
	TEXT_CSV: "text/csv",

	// Application types
	APPLICATION_JSON: "application/json",
	APPLICATION_FORM_URLENCODED: "application/x-www-form-urlencoded",
	APPLICATION_FORM_DATA: "multipart/form-data",

	// XML types
	APPLICATION_XML: "application/xml",
	TEXT_XML: "text/xml",

	// Binary types
	APPLICATION_OCTET_STREAM: "application/octet-stream",
	APPLICATION_PDF: "application/pdf",
	APPLICATION_ZIP: "application/zip",

	// Image types
	IMAGE_JPEG: "image/jpeg",
	IMAGE_PNG: "image/png",
	IMAGE_GIF: "image/gif",
	IMAGE_SVG_XML: "image/svg+xml",
	IMAGE_WEBP: "image/webp",

	// Audio types
	AUDIO_MPEG: "audio/mpeg",
	AUDIO_OGG: "audio/ogg",
	AUDIO_WAV: "audio/wav",

	// Video types
	VIDEO_MP4: "video/mp4",
	VIDEO_WEBM: "video/webm",
	VIDEO_OGG: "video/ogg",
} as const;

Object.freeze(ContentType);
Object.seal(ContentType);

export type ContentTypes = (typeof ContentType)[keyof typeof ContentType];

export { ContentType };
