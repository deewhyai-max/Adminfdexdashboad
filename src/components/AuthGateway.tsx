/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldCheck, Activity, AlertCircle, Mail, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthGatewayProps {
  onLogin: (user: any) => void;
}

export default function AuthGateway({ onLogin }: AuthGatewayProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      setIsLoading(false);
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginError) {
        if (loginError.message?.toLowerCase().includes('invalid login credentials')) {
          throw new Error('Invalid email or password. Please check your credentials and try again.');
        }
        if (loginError.message?.toLowerCase().includes('email not confirmed')) {
          throw new Error('Please confirm your email address before signing in.');
        }
        throw loginError;
      }

      if (data.user) {
        onLogin(data.user);
      }
    } catch (err: any) {
      setError(err.message || 'Unable to sign in. Please verify your email address and password.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden text-[16px]">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-fedex-purple rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-600 rounded-full blur-[120px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.2 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-8 md:p-10 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 bg-fedex-purple rounded-2xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(77,20,140,0.35)] border border-purple-400/20">
              <ShieldCheck className="text-white w-8 h-8" />
            </div>
            <h1 className="text-white text-2xl font-black tracking-tight uppercase leading-tight">
              FedEx <span className="text-fedex-purple">Portal</span>
            </h1>
            <p className="text-slate-400 text-xs mt-2 font-medium max-w-xs">
              Sign in to manage and track enterprise shipments
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 px-1">
                <Mail className="w-3.5 h-3.5 text-fedex-purple" />
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email address"
                required
                autoComplete="email"
                className="w-full bg-slate-950/70 border border-slate-700 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:border-fedex-purple focus:ring-2 focus:ring-fedex-purple/20 transition-all text-sm font-medium placeholder:text-slate-500 hover:border-slate-600"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2 px-1">
                <Lock className="w-3.5 h-3.5 text-fedex-purple" />
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
                className="w-full bg-slate-950/70 border border-slate-700 text-white px-4 py-3.5 rounded-xl focus:outline-none focus:border-fedex-purple focus:ring-2 focus:ring-fedex-purple/20 transition-all text-sm font-medium placeholder:text-slate-500 hover:border-slate-600"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Error Message */}
            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/30 p-3.5 rounded-xl flex items-start gap-2.5 text-red-400"
                >
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
                  <span className="text-xs font-medium leading-relaxed">{error}</span>
                </motion.div>
              )}
            </AnimatePresence>
            
            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-fedex-purple hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all active:scale-[0.99] shadow-lg shadow-fedex-purple/25 text-sm flex items-center justify-center gap-2.5 disabled:opacity-50 group cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <LogIn className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          {/* Help & Information Box */}
          <div className="mt-8 pt-6 border-t border-slate-800/80 text-center space-y-2">
            <p className="text-slate-400 text-xs font-medium leading-relaxed">
              Don't have access yet? Please contact your administrator to be added to the portal.
            </p>
            <p className="text-slate-500 text-[11px] leading-relaxed">
              New accounts require administrator approval before creating or managing shipments.
            </p>
          </div>
        </div>

        {/* Security Notice Footer */}
        <div className="mt-8 flex items-center justify-center gap-2 text-slate-500 text-xs font-medium">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
          <span>Protected by FedEx Enterprise Authentication</span>
        </div>
      </motion.div>
    </div>
  );
}
