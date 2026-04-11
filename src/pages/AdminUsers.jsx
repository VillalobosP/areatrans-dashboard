import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { getToken } from '../context/AuthContext';

const BASE_URL = process.env.REACT_APP_API_URL || '';
const CENTROS_DISPONIBLES = ['getafe', 'illescas'];

function api(method, path, data) {
  return axios({ method, url: `${BASE_URL}${path}`, data,
    headers: { Authorization: `Bearer ${getToken()}` } });
}

const S = {
  root:   { padding: '28px 32px', color: '#fff' },
  title:  { fontSize: 20, fontWeight: 700, marginBottom: 4, color: '#fff' },
  sub:    { fontSize: 12, color: '#555', marginBottom: 28 },
  card:   { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: '20px 24px', marginBottom: 24 },
  label:  { fontSize: 11, color: '#666', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block' },
  input:  { background: '#252525', border: '1px solid #3a3a3a', borderRadius: 7, color: '#fff', fontSize: 13, padding: '8px 12px', outline: 'none', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' },
  select: { background: '#252525', border: '1px solid #3a3a3a', borderRadius: 7, color: '#fff', fontSize: 13, padding: '8px 12px', outline: 'none', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' },
  btnPrimary: { background: '#1e3a8a', border: 'none', borderRadius: 7, color: '#fff', fontSize: 13, fontWeight: 700, padding: '9px 18px', cursor: 'pointer' },
  btnDanger:  { background: 'transparent', border: '1px solid #5a1a1a', borderRadius: 7, color: '#ff6b6b', fontSize: 12, padding: '6px 12px', cursor: 'pointer' },
  btnEdit:    { background: 'transparent', border: '1px solid #2a3a5a', borderRadius: 7, color: '#4da6ff', fontSize: 12, padding: '6px 12px', cursor: 'pointer' },
  error: { background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8, padding: '10px 14px', color: '#ff8888', fontSize: 13, marginBottom: 16 },
  ok:    { background: '#1a3a2a', border: '1px solid #44aa66', borderRadius: 8, padding: '10px 14px', color: '#4dcc7a', fontSize: 13, marginBottom: 16 },
  th: { textAlign: 'left', padding: '8px 14px', color: '#555', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid #2a2a2a' },
  td: { padding: '10px 14px', borderBottom: '1px solid #222', color: '#ccc', verticalAlign: 'middle' },
};

function Badge({ label, color = '#1e3a8a' }) {
  return (
    <span style={{ background: color, borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, color: '#fff', marginRight: 4 }}>
      {label.toUpperCase()}
    </span>
  );
}

export default function AdminUsers() {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg,     setMsg]     = useState({ type: '', text: '' });
  const [editUser, setEditUser] = useState(null); // usuario en edición

  // Formulario nuevo usuario
  const [form, setForm] = useState({ username: '', password: '', role: 'viewer', centros: [] });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api('get', '/api/admin/users');
      setUsers(data);
    } catch (err) {
      setMsg({ type: 'error', text: err.response?.data?.error || 'Error al cargar usuarios' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function crearUsuario(e) {
    e.preventDefault();
    if (!form.username || !form.password) { setMsg({ type: 'error', text: 'Usuario y contraseña obligatorios' }); return; }
    try {
      await api('post', '/api/admin/users', form);
      setMsg({ type: 'ok', text: `Usuario "${form.username}" creado correctamente` });
      setForm({ username: '', password: '', role: 'viewer', centros: [] });
      loadUsers();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Error al crear usuario' }); }
  }

  async function guardarEdicion() {
    if (!editUser) return;
    try {
      const body = { role: editUser.role, centros: editUser.centros };
      if (editUser.newPassword) body.password = editUser.newPassword;
      await api('put', `/api/admin/users/${editUser.username}`, body);
      setMsg({ type: 'ok', text: `Usuario "${editUser.username}" actualizado` });
      setEditUser(null);
      loadUsers();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Error al actualizar' }); }
  }

  async function eliminar(username) {
    if (!window.confirm(`¿Eliminar el usuario "${username}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api('delete', `/api/admin/users/${username}`);
      setMsg({ type: 'ok', text: `Usuario "${username}" eliminado` });
      loadUsers();
    } catch (err) { setMsg({ type: 'error', text: err.response?.data?.error || 'Error al eliminar' }); }
  }

  function toggleCentro(centros, centro) {
    return centros.includes(centro) ? centros.filter(c => c !== centro) : [...centros, centro];
  }

  return (
    <div style={S.root}>
      <div style={S.title}>Gestión de usuarios</div>
      <div style={S.sub}>Solo los administradores pueden acceder a esta sección</div>

      {msg.text && (
        <div style={msg.type === 'error' ? S.error : S.ok} onClick={() => setMsg({ type: '', text: '' })} role="alert">
          {msg.text} <span style={{ float: 'right', cursor: 'pointer', opacity: 0.6 }}>✕</span>
        </div>
      )}

      {/* ── Tabla de usuarios ── */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Usuarios registrados
        </div>
        {loading
          ? <div style={{ color: '#555', fontSize: 13 }}>Cargando…</div>
          : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Usuario</th>
                    <th style={S.th}>Rol</th>
                    <th style={S.th}>Centros</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.username}>
                      <td style={{ ...S.td, fontWeight: 600, color: '#fff' }}>{u.username}</td>
                      <td style={S.td}>
                        <Badge label={u.role} color={u.role === 'admin' ? '#7c3aed' : '#1e3a8a'} />
                      </td>
                      <td style={S.td}>
                        {(u.centros || []).map(c => <Badge key={c} label={c} color="#1a3a2a" />)}
                        {(!u.centros || u.centros.length === 0) && <span style={{ color: '#555', fontSize: 12 }}>Sin acceso</span>}
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' }}>
                        <button style={{ ...S.btnEdit, marginRight: 8 }}
                          onClick={() => setEditUser({ ...u, newPassword: '' })}>
                          Editar
                        </button>
                        <button style={S.btnDanger} onClick={() => eliminar(u.username)}>
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr><td colSpan={4} style={{ ...S.td, textAlign: 'center', color: '#555', padding: 24 }}>Sin usuarios</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )
        }
      </div>

      {/* ── Modal edición ── */}
      {editUser && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 14, padding: '28px 32px', width: 380, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Editar — {editUser.username}</div>

            <div>
              <label style={S.label}>Rol</label>
              <select style={S.select} value={editUser.role}
                onChange={e => setEditUser(p => ({ ...p, role: e.target.value }))}>
                <option value="viewer">viewer</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <div>
              <label style={S.label}>Centros con acceso</label>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {CENTROS_DISPONIBLES.map(c => (
                  <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editUser.centros?.includes(c) || false}
                      onChange={() => setEditUser(p => ({ ...p, centros: toggleCentro(p.centros || [], c) }))} />
                    {c.toUpperCase()}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label style={S.label}>Nueva contraseña (dejar vacío para no cambiar)</label>
              <input type="password" style={S.input} placeholder="••••••••"
                value={editUser.newPassword}
                onChange={e => setEditUser(p => ({ ...p, newPassword: e.target.value }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <button style={S.btnEdit} onClick={() => setEditUser(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={guardarEdicion}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crear nuevo usuario ── */}
      <div style={S.card}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#888', marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Crear nuevo usuario
        </div>
        <form onSubmit={crearUsuario} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={S.label}>Usuario</label>
            <input style={S.input} value={form.username} placeholder="nombre.usuario"
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Contraseña</label>
            <input type="password" style={S.input} value={form.password} placeholder="••••••••"
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div>
            <label style={S.label}>Rol</label>
            <select style={S.select} value={form.role}
              onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
              <option value="viewer">viewer</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Centros con acceso</label>
            <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
              {CENTROS_DISPONIBLES.map(c => (
                <label key={c} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ccc', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.centros.includes(c)}
                    onChange={() => setForm(p => ({ ...p, centros: toggleCentro(p.centros, c) }))} />
                  {c.toUpperCase()}
                </label>
              ))}
            </div>
          </div>
          <div style={{ gridColumn: '1 / -1', textAlign: 'right' }}>
            <button type="submit" style={S.btnPrimary}>Crear usuario</button>
          </div>
        </form>
      </div>
    </div>
  );
}
