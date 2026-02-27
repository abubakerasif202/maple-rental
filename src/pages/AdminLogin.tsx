import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // The server sets the 'admin_token' as an HTTP-only cookie
      await api.post('/auth/login', { username, password });
      navigate('/admin/dashboard');
    } catch (err) {
      setError('Invalid credentials');
    }
  };

  return (
    <div className="min-h-screen bg-brand-navy flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-brand-navy-light p-10 rounded-xl shadow-2xl border border-white/10">
        <h2 className="text-center text-3xl font-serif font-bold text-white tracking-tight">Admin Login</h2>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && <p className="text-red-500 text-sm text-center font-bold uppercase tracking-widest">{error}</p>}
          <div className="space-y-4">
            <input
              type="text"
              required
              className="appearance-none rounded-md relative block w-full px-4 py-3 border border-white/10 bg-brand-navy text-white placeholder-brand-grey/50 focus:outline-none focus:border-brand-gold focus:z-10 sm:text-sm font-light transition-colors"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              type="password"
              required
              className="appearance-none rounded-md relative block w-full px-4 py-3 border border-white/10 bg-brand-navy text-white placeholder-brand-grey/50 focus:outline-none focus:border-brand-gold focus:z-10 sm:text-sm font-light transition-colors"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-sm font-bold rounded-md text-brand-navy bg-brand-gold hover:bg-brand-gold-light focus:outline-none transition-all uppercase tracking-widest shadow-lg"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
