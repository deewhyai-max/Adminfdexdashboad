/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lock, ShieldCheck, ArrowRight, Activity, AlertCircle, Mail, UserPlus, LogIn } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthGatewayProps {
  onLogin: (user: any) => void;
}

export default function AuthGateway({ onLogin }: AuthGatewayProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setMsg(null);

    try {
      if (isLogin) {
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (loginError) {
          if (loginError.message === 'Invalid login credentials') {
            throw new Error('Wrong credentials. Please verify your identifier and cipher.');
          }
          throw loginError;
        }
        if (data.user) onLogin(data.user);
      } else {
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        
        // Ensure manual login by signing out if Supabase auto-logged them in
        if (signUpData.session) {
          await supabase.auth.signOut();
        }

        setMsg('Node registration successful. You must now sign in to establish a link.');
        setIsLogin(true);
        setPassword('');
      }
    } catch (err: any) {
      setError(err.message || 'Verification Failed');
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
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl">
          <div className="flex flex-col items-center mb-10 text-center">
            <div className="w-20 h-20 bg-fedex-purple rounded-3xl flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(77,20,140,0.3)] border border-purple-400/20">
              <ShieldCheck className="text-white w-10 h-10" />
            </div>
            <h1 className="text-white text-3xl font-black tracking-tight uppercase leading-none">
              FedEx <span className="text-fedex-purple">Tower</span>
            </h1>
            <p className="text-slate-500 text-[10px] mt-3 uppercase tracking-[0.4em] font-black">Secure Gateway Protocol</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                <Mail className="w-3 h-3" /> Node Identifier
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@tower-node.net"
                required
                className="w-full bg-slate-950/50 border-2 border-slate-800 text-white px-6 py-5 rounded-2xl focus:outline-none focus:border-fedex-purple transition-all text-base font-bold placeholder:text-slate-700 hover:border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1">
                <Lock className="w-3 h-3" /> Access Cipher
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                required
                className="w-full bg-slate-950/50 border-2 border-slate-800 text-white px-6 py-5 rounded-2xl focus:outline-none focus:border-fedex-purple transition-all text-base font-bold placeholder:text-slate-700 hover:border-slate-700"
              />
            </div>

            <AnimatePresence mode="wait">
              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl flex items-center justify-center gap-3 text-red-500 mb-4"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{error}</span>
                </motion.div>
              )}

              {msg && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-green-500/10 border border-green-500/20 p-4 rounded-xl flex items-center justify-center gap-3 text-green-500 mb-4"
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{msg}</span>
                </motion.div>
              )}
            </AnimatePresence>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-fedex-purple hover:bg-purple-700 text-white font-black py-6 rounded-[1.5rem] transition-all active:scale-[0.98] shadow-2xl shadow-fedex-purple/30 uppercase tracking-[0.2em] disabled:opacity-20 text-xs flex items-center justify-center gap-3 group"
            >
              {isLoading ? (
                <Activity className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  {isLogin ? (
                    <>Establish Link <LogIn className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                  ) : (
                    <>Register Node <UserPlus className="w-4 h-4 group-hover:translate-x-1 transition-transform" /></>
                  )}
                </>
              )}
            </button>
          </form>

          <button 
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
              setMsg(null);
            }}
            className="w-full text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-8 hover:text-slate-300 transition-colors py-2"
          >
            {isLogin ? "Initialize New Operator Node" : "Return to Control Gateway"}
          </button>
        </div>

        <div className="mt-12 flex flex-col items-center gap-2 opacity-30">
          <div className="text-[9px] text-slate-500 font-mono uppercase tracking-[0.4em]">Node Link: Secured</div>
          <div className="flex gap-4">
            <div className="w-1 h-1 rounded-full bg-slate-500" />
            <div className="w-1 h-1 rounded-full bg-slate-500" />
            <div className="w-1 h-1 rounded-full bg-slate-500" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
