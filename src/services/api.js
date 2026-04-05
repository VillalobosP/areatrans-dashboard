import axios from 'axios';

// En local usa http://localhost:3001 (definido en .env)
// En Vercel usa URL relativa '' (misma URL, Vercel enruta /api/* al servidor)
const BASE_URL = process.env.REACT_APP_API_URL || '';
const api = axios.create({ baseURL: BASE_URL });

// ── Rutas ─────────────────────────────────────────────────────────────────────
export async function getCalendario(desde, hasta) {
  const { data } = await api.get('/api/calendario', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar calendario'); });
  return data;
}

export async function getResumen(desde, hasta) {
  const { data } = await api.get('/api/resumen', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar resumen'); });
  return data;
}

// ── Facturación ───────────────────────────────────────────────────────────────
export async function getFacturacion(desde, hasta) {
  const { data } = await api.get('/api/facturacion', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar facturación'); });
  return data;
}

export async function getFacturacionResumen(desde, hasta) {
  const { data } = await api.get('/api/facturacion/resumen', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar resumen de facturación'); });
  return data;
}

// ── Flota & Gasoil ────────────────────────────────────────────────────────────
export async function getGasoil(desde, hasta) {
  const { data } = await api.get('/api/gasoil', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar gasoil'); });
  return data;
}

export async function getGasoilResumen(desde, hasta) {
  const { data } = await api.get('/api/gasoil/resumen', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar resumen gasoil'); });
  return data;
}

export async function getKmDesviacion(desde, hasta) {
  const { data } = await api.get('/api/km-desviacion', { params: { desde, hasta } })
    .catch(err => { throw new Error(err.response?.data?.error || 'Error al cargar desviación km'); });
  return data;
}
