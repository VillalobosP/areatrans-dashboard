import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Logo from '../components/Logo';
import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '';

export default function Login() {
  const { login } = useAuth();
  const navigate   = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!username || !password) { setError('Introduce usuario y contraseña'); return; }
    setLoading(true); setError('');
    try {
      const { data } = await axios.post(`${BASE_URL}/api/auth/login`, { username, password });
      login(data);
      // Redirige al primer centro disponible del usuario
      const firstCentro = data.centros?.[0] || 'getafe';
      navigate(`/dashboard/${firstCentro}/rutas`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#111',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
    }}>
      <Logo height={72} />

      <form onSubmit={handleSubmit} style={{
        background: '#1a1a1a',
        border: '1px solid #2a2a2a',
        borderRadius: 14,
        padding: '36px 40px',
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        width: 320,
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#fff' }}>
            Acceso al dashboard
          </h2>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#555' }}>
            Introduce tus credenciales para continuar
          </p>
        </div>

        {error && (
          <div style={{
            background: '#3a1a1a', border: '1px solid #ff4444', borderRadius: 8,
            padding: '10px 14px', color: '#ff8888', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Usuario
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            style={inputStyle}
            placeholder="nombre de usuario"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            style={inputStyle}
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            background: loading ? '#2a3a5a' : '#1e3a8a',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            fontWeight: 700,
            padding: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
            marginTop: 4,
            letterSpacing: '0.03em',
          }}
        >
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

const inputStyle = {
  background: '#252525',
  border: '1px solid #3a3a3a',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
  padding: '10px 14px',
  outline: 'none',
  colorScheme: 'dark',
  width: '100%',
  boxSizing: 'border-box',
};
