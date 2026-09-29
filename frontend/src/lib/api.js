import axios from "axios";

// Development uses CRA's same-origin proxy to avoid browser CORS issues.
// Production keeps using the configured absolute backend URL.
const BACKEND_URL = process.env.NODE_ENV === "development"
  ? ""
  : process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("rizpos_token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

export default api;

export const formatIDR = (n) => {
  const v = Number.isFinite(+n) ? +n : 0;
  return "Rp " + Math.round(v).toLocaleString("id-ID");
};

export const formatDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

export const formatApiError = (e) => {
  const d = e?.response?.data?.detail;
  if (!d) return e?.message || "Terjadi kesalahan";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.map((x) => x?.msg || JSON.stringify(x)).join(", ");
  return String(d);
};
