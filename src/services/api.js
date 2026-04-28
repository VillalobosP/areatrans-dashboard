import axios from 'axios';
import { getToken } from '../context/AuthContext';

const BASE_URL = process.env.REACT_APP_API_URL || '';
const api = axios.create({ baseURL: BASE_URL });

// Adjunta el JWT a todas las peticiones automáticamente
api.interceptors.request.use(config => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Función helper para manejar errores de manera consistente
function handleError(err, fallback) {
  throw new Error(err.response?.data?.error || fallback);
}

// ── Rutas ─────────────────────────────────────────────────────────────────────
export async function getCalendario(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/calendario`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar calendario'));
  return data;
}

export async function getResumen(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/resumen`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar resumen'));
  return data;
}

// ── Facturación ───────────────────────────────────────────────────────────────
export async function getFacturacion(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/facturacion`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar facturación'));
  return data;
}

export async function getFacturacionResumen(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/facturacion/resumen`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar resumen de facturación'));
  return data;
}

// ── Flota & Gasoil ────────────────────────────────────────────────────────────
export async function getGasoil(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/gasoil`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar gasoil'));
  return data;
}

export async function getGasoilResumen(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/gasoil/resumen`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar resumen gasoil'));
  return data;
}

export async function getHoras(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/horas`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar horas'));
  return data;
}

export async function getKmDesviacion(centro, desde, hasta) {
  const { data } = await api.get(`/api/${centro}/km-desviacion`, { params: { desde, hasta } })
    .catch(err => handleError(err, 'Error al cargar desviación km'));
  return data;
}

export async function getTaller(centro) {
  const { data } = await api.get(`/api/${centro}/taller`)
    .catch(err => handleError(err, 'Error al cargar taller'));
  return data;
}
