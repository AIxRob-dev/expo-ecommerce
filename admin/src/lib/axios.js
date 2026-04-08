import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "http://localhost:3000/api",
  withCredentials: true,
});

let interceptorId = null;

export const setupAxiosInterceptors = (getToken) => {
  // remove previous interceptor if exists
  if (interceptorId !== null) {
    axiosInstance.interceptors.request.eject(interceptorId);
  }

  interceptorId = axiosInstance.interceptors.request.use(async (config) => {
    const token = await getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });
};

export default axiosInstance;