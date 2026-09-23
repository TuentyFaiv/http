export const getJson = async (url) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}
	return response.json();
};
