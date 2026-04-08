import axios from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL + "/", // ✅ trailing slash fixes this
  withCredentials: true,
});

export default axiosInstance;
