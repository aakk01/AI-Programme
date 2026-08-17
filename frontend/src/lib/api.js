import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const errMsg = (e) => {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d?.code === "pro_required") return "Pro subscription required";
  return d?.detail || e?.message || "Something went wrong";
};

export const isProRequired = (e) =>
  e?.response?.status === 402 && e?.response?.data?.detail?.code === "pro_required";

export const downloadExport = async (projectId, fmt) => {
  let res;
  try {
    res = await api.get(`/projects/${projectId}/export/${fmt}`, {
      responseType: "blob",
    });
  } catch (e) {
    // Blob responses hide JSON error bodies — re-hydrate detail so callers can
    // check e.response.status / e.response.data.detail as usual.
    if (e?.response?.data instanceof Blob) {
      try {
        const text = await e.response.data.text();
        e.response.data = JSON.parse(text);
      } catch {
        /* leave as-is */
      }
    }
    throw e;
  }
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
