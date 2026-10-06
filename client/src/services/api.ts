import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('civicpulse-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && !error.response) {
      return Promise.reject(new Error('Unable to connect to server. Please try again.'));
    }
    return Promise.reject(error);
  },
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Unable to connect to server. Please try again.';
    const detail = error.response.data?.detail || error.response.data?.message;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return detail.map((issue: { msg?: string }) => issue.msg).filter(Boolean).join(', ');
    if (error.response.status === 401) return 'Your session has expired. Please log in again.';
    if (error.response.status === 403) return 'You do not have permission to perform this action.';
    if (error.response.status === 404) return 'The requested record was not found.';
    if (error.response.status === 429) return 'Too many requests. Please wait and try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
