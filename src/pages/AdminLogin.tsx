import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import api from '../lib/api';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/login', { username: username.trim(), password });
      navigate('/admin/dashboard');
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'Login failed');
      } else {
        setError('Login failed');
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] bg-brand-navy py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-brand-navy-light p-10 rounded-xl shadow-2xl border border-white/10">
        <div>
          <h2 className="text-center text-3xl font-serif font-bold text-white tracking-tight">Admin Access</h2>
          <p className="mt-2 text-center text-xs text-brand-gold font-bold uppercase tracking-[0.3em]">Maple Rentals Management</p>
        </div>
        
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-md">
              <p className="text-red-500 text-xs text-center font-bold uppercase tracking-widest">{error}</p>
            </div>
          )}
          
          <div className="space-y-4">
            <div>
              <label className="sr-only">Admin Email</label>
              <input
                type="email"
                required
                className="appearance-none rounded-md relative block w-full px-4 py-3 border border-white/10 bg-brand-navy text-white placeholder-brand-grey/50 focus:outline-none focus:border-brand-gold focus:z-10 sm:text-sm font-light transition-colors"
                placeholder="Email Address"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div>
              <label className="sr-only">Password</label>
              <input
                type="password"
                required
                className="appearance-none rounded-md relative block w-full px-4 py-3 border border-white/10 bg-brand-navy text-white placeholder-brand-grey/50 focus:outline-none focus:border-brand-gold focus:z-10 sm:text-sm font-light transition-colors"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          <button
            type="submit"
            className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-sm font-bold rounded-md text-brand-navy bg-brand-gold hover:bg-brand-gold-light focus:outline-none transition-all uppercase tracking-widest shadow-lg"
          >
            Sign in to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
