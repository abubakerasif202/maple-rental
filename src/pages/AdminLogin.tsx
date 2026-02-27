import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

export default function AdminLogin() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (res.ok) {
        localStorage.setItem('admin_token', data.token);
        navigate('/admin/dashboard');
      } else {
        setError(data.error || 'Login failed');
      }
    } catch (err) {
      setError('An error occurred');
    }
  };

  return (
    <div className="min-h-screen bg-brand-navy flex flex-col justify-center py-12 sm:px-6 lg:px-8 selection:bg-brand-gold selection:text-brand-navy">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <div className="bg-brand-gold p-5 shadow-lg">
            <Lock className="w-10 h-10 text-brand-navy" />
          </div>
        </div>
        <h2 className="text-center text-3xl font-serif font-bold text-white mb-2 tracking-tight">Admin Portal</h2>
        <p className="text-center text-sm text-brand-grey mb-10 uppercase tracking-widest font-medium">
          Fleet Management Access
        </p>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-brand-navy-light py-10 px-6 shadow-2xl border border-white/10 sm:px-12">
          {error && (
            <div className="bg-red-900/20 border-l-4 border-red-500 p-4 mb-8">
              <p className="text-red-400 font-medium text-sm">{error}</p>
            </div>
          )}

          <form className="space-y-8" onSubmit={handleLogin}>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-brand-gold uppercase tracking-widest">Username</label>
              <input
                type="text"
                required
                className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] font-bold text-brand-gold uppercase tracking-widest">Password</label>
              <input
                type="password"
                required
                className="w-full bg-brand-navy border border-white/10 px-4 py-3 text-white focus:border-brand-gold outline-none transition-colors font-light"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                className="w-full flex justify-center py-4 px-4 bg-brand-gold text-brand-navy font-bold text-sm uppercase tracking-widest hover:bg-brand-gold-light transition-all shadow-lg"
              >
                Sign in
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
