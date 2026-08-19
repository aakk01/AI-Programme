import axios from "axios";

export const api = axios.create({
  baseURL: "/api",
  timeout: 60000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("pow_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("pow_token");
    }
    return Promise.reject(error);
  }
);

export function errMsg(error) {
  if (!error) return "An unexpected error occurred";
  if (typeof error === "string") return error;
  if (error.response?.data?.detail) {
    if (typeof error.response.data.detail === "string") {
      return error.response.data.detail;
    }
    if (Array.isArray(error.response.data.detail)) {
      return error.response.data.detail.map((d) => d.msg || JSON.stringify(d)).join(", ");
    }
  }
  if (error.response?.data?.error) return error.response.data.error;
  if (error.response?.data?.message) return error.response.data.message;
  if (error.message) return error.message;
  return "An unexpected error occurred";
}

export function isProRequired(error) {
  if (!error) return false;
  if (error.response?.status === 402) return true;
  const msg = errMsg(error).toLowerCase();
  return msg.includes("pro plan") || msg.includes("subscription required") || msg.includes("upgrade to pro");
}

export async function downloadExport(projectId, format, fallbackFilename) {
  const res = await api.get(`/projects/${projectId}/export/${format}`, {
    responseType: "blob",
  });

  let filename = fallbackFilename;
  if (!filename) {
    const disposition = res.headers["content-disposition"] || "";
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    } else {
      const ext = format === "msproject" || format === "asta" ? "xml" : format;
      filename = `programme_${projectId}.${ext}`;
    }
  }

  const blob = new Blob([res.data]);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export default api;
