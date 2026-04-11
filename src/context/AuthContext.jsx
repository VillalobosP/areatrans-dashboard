import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

function parseJwt(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

function loadUserFromStorage() {
  try {
    const token = localStorage.getItem('areatrans_token');
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload || payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('areatrans_token');
      return null;
    }
    return { username: payload.username, role: payload.role, centros: payload.centros };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(loadUserFromStorage);

  function login(data) {
    // data = { token, username, role, centros }
    localStorage.setItem('areatrans_token', data.token);
    setUser({ username: data.username, role: data.role, centros: data.centros });
  }

  function logout() {
    localStorage.removeItem('areatrans_token');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function getToken() {
  return localStorage.getItem('areatrans_token');
}
