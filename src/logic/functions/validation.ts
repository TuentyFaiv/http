import type { ResponseKind } from "../typing/classes/preset.typing.js";

import { ContentType } from "../typing/enums/content.js";

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateContentType(contentType: string) {
	if (contentType.includes(ContentType.APPLICATION_JSON)) {
		return {
			json: true,
			file: false,
			text: false,
		};
	}

	const isFile =
		contentType.includes(ContentType.APPLICATION_OCTET_STREAM) ||
		contentType.includes(ContentType.APPLICATION_ZIP) ||
		contentType.includes(ContentType.APPLICATION_PDF);
	const isImage =
		contentType.includes(ContentType.IMAGE_JPEG) ||
		contentType.includes(ContentType.IMAGE_PNG) ||
		contentType.includes(ContentType.IMAGE_GIF) ||
		contentType.includes(ContentType.IMAGE_WEBP) ||
		contentType.includes(ContentType.IMAGE_SVG_XML);
	const isAudio =
		contentType.includes(ContentType.AUDIO_MPEG) ||
		contentType.includes(ContentType.AUDIO_OGG) ||
		contentType.includes(ContentType.AUDIO_WAV);
	const isVideo =
		contentType.includes(ContentType.VIDEO_MP4) ||
		contentType.includes(ContentType.VIDEO_WEBM) ||
		contentType.includes(ContentType.VIDEO_OGG);

	if (isFile || isImage || isAudio || isVideo) {
		return {
			json: false,
			file: true,
			text: false,
		};
	}

	const isText =
		contentType.includes(ContentType.TEXT_PLAIN) ||
		contentType.includes(ContentType.TEXT_HTML) ||
		contentType.includes(ContentType.TEXT_CSS) ||
		contentType.includes(ContentType.TEXT_JAVASCRIPT) ||
		contentType.includes(ContentType.TEXT_CSV);
	const isXml = contentType.includes(ContentType.APPLICATION_XML) || contentType.includes(ContentType.TEXT_XML);

	if (isText || isXml) {
		return {
			json: false,
			file: false,
			text: true,
		};
	}

	return {
		json: false,
		file: false,
		text: false,
	};
}

export function detectResponseKind(contentType: string | null): ResponseKind {
	// No Content-Type still guesses json, matching how servers this was built for behave.
	if (!contentType) {
		return "json";
	}

	const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";

	// Covers application/problem+json, application/vnd.api+json and friends.
	if (type.endsWith("+json")) {
		return "json";
	}

	const validated = validateContentType(type);

	if (validated.json) {
		return "json";
	}
	if (validated.file) {
		return "file";
	}
	if (validated.text) {
		return "text";
	}

	return "unknown";
}
