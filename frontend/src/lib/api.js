import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errMsg = (e) =>
  e?.response?.data?.detail || e?.message || "Something went wrong";

export const downloadExport = async (projectId, fmt) => {
  const res = await api.get(`/projects/${projectId}/export/${fmt}`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  const cd = res.headers["content-disposition"] || "";
  a.download = /filename="?([^"]+)"?/.exec(cd)?.[1] || `programme.${fmt}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export { API };
