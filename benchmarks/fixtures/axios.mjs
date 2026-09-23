import axios from "axios";

export const getJson = (url) => axios.get(url).then((response) => response.data);
