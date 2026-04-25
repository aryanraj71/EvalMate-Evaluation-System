import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000/api"
});

// Add auth token to requests
API.interceptors.request.use((config) => {
  const token = localStorage.getItem("evalmate_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
API.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect if 401 AND it's not a login/signup attempt
    if (error.response?.status === 401 && !error.config.url.includes('/auth/login') && !error.config.url.includes('/auth/signup')) {
      localStorage.removeItem("evalmate_token");
      localStorage.removeItem("evalmate_user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default API;