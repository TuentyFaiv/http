// Token colors are intentionally limited to the approved violet / saffron / teal palette.
export const codeThemes = [
	{
		name: "fetchzen-dark",
		type: "dark",
		colors: {
			"editor.background": "#0A0C15",
			"editor.foreground": "#F8F8FF",
		},
		tokenColors: [
			{ scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#C4BFD3" } },
			{ scope: ["keyword", "storage", "entity.name.type", "support.type"], settings: { foreground: "#D4B5FF" } },
			{ scope: ["string", "entity.name.function", "support.function"], settings: { foreground: "#7FE7D7" } },
			{ scope: ["constant", "variable.language", "entity.name.tag"], settings: { foreground: "#FFD27A" } },
		],
	},
	{
		name: "fetchzen-light",
		type: "light",
		colors: {
			"editor.background": "#EAEAF4",
			"editor.foreground": "#15132B",
		},
		tokenColors: [
			{ scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#494459" } },
			{ scope: ["keyword", "storage", "entity.name.type", "support.type"], settings: { foreground: "#512A78" } },
			{ scope: ["string", "entity.name.function", "support.function"], settings: { foreground: "#004E4E" } },
			{ scope: ["constant", "variable.language", "entity.name.tag"], settings: { foreground: "#704000" } },
		],
	},
];
