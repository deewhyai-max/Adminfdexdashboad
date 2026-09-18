/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, Clock, RefreshCw, LogOut, CheckCircle, Copy, Check, Database } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PendingApprovalProps {
  email: string;
  userId: string;
  isTableMissing?: boolean;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export default function PendingApproval({
  email,
  userId,
  isTableMissing,
  onRefresh,
  onLogout,
}: PendingApprovalProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSqlModal, setShowSqlModal] = useState(false);
  const [hasCopied, setHasCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await onRefresh();
      setStatusMessage('Status checked. Account is still pending administrator approval.');
    } catch {
      setStatusMessage('Unable to check approval status. Please try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const sqlCode = `-- Run this in your Supabase SQL Editor:
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  username text unique,
  name text default null,
  phone text default null,
  company text default null,
  address text default null,
  is_approved boolean not null default false,
  role text default 'operator',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

alter table public.profiles enable row level security;

create policy "Users can view own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "Users can insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- Trigger to auto-create profile when user signs up or is added
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, username, is_approved)
  values (new.id, new.email, lower(split_part(new.email, '@', 1)), false)
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- To approve this user (${email}), run:
update public.profiles set is_approved = true where email = '${email}';`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlCode);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden text-[16px]">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-amber-600 rounded-full blur-[140px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fedex-purple rounded-full blur-[140px]" />
      </div>

      <motion.div 
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-lg relative z-10"
      >
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-[2rem] p-8 md:p-10 shadow-2xl">
          {/* Header Icon */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <Clock className="text-amber-400 w-8 h-8" />
            </div>
            
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Approval Required
            </div>

            <h1 className="text-white text-2xl font-black tracking-tight uppercase leading-tight">
              Account Pending Approval
            </h1>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-md">
              Your account has been verified, but you are not yet approved to access the dispatch system or create shipments.
            </p>
          </div>

          {/* Account Details Box */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 mb-6 space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium">Logged-in Email:</span>
              <span className="text-white font-bold truncate max-w-[200px]">{email}</span>
            </div>
            <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-3">
              <span className="text-slate-400 font-medium">Shipment Access:</span>
              <span className="text-amber-400 font-bold flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5" />
                Restricted (Unapproved)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-3">
              <span className="text-slate-400 font-medium">Account ID:</span>
              <span className="text-slate-400 font-mono text-[11px] truncate max-w-[180px]">{userId}</span>
            </div>
          </div>

          {statusMessage && (
            <div className="mb-6 p-3.5 rounded-xl bg-slate-800/70 border border-slate-700 text-xs text-slate-300 text-center font-medium leading-relaxed">
              {statusMessage}
            </div>
          )}

          {/* Table Missing Notice for Administrators */}
          {isTableMissing && (
            <div className="mb-6 p-4 rounded-xl bg-purple-950/40 border border-purple-800/50 text-xs space-y-2">
              <div className="flex items-center gap-2 text-purple-300 font-bold">
                <Database className="w-4 h-4 text-fedex-purple" />
                <span>Administrator Notice: Schema Setup</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                The <code className="text-purple-300 font-mono">public.profiles</code> table has not yet been initialized in your Supabase project. Click below to view and copy the SQL migration query.
              </p>
              <button
                onClick={() => setShowSqlModal(true)}
                className="mt-1 text-xs text-purple-400 hover:text-purple-300 font-bold underline cursor-pointer"
              >
                View & Copy Supabase Setup SQL
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="w-full bg-fedex-purple hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-fedex-purple/20 text-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Checking Status...' : 'Check Approval Status'}</span>
            </button>

            <button
              onClick={onLogout}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-3.5 rounded-xl transition-all border border-slate-700 text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span>Sign Out</span>
            </button>
          </div>

          <div className="mt-8 text-center">
            <p className="text-slate-500 text-xs leading-relaxed">
              Please contact your FedEx system administrator to review and activate your account.
            </p>
          </div>
        </div>
      </motion.div>

      {/* SQL Setup Modal */}
      {showSqlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-white font-bold text-sm">
                <Database className="w-4 h-4 text-fedex-purple" />
                <span>Supabase Profiles & Approval SQL</span>
              </div>
              <button
                onClick={() => setShowSqlModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-slate-800"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <p className="text-slate-400 text-xs mb-3">
                Run this in your <strong>Supabase Dashboard → SQL Editor → New Query</strong> to create the profiles table, RLS policies, and new-user trigger:
              </p>
              <pre className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-xs font-mono text-emerald-400 overflow-x-auto whitespace-pre leading-relaxed">
                {sqlCode}
              </pre>
            </div>

            <div className="p-5 border-t border-slate-800 flex justify-end gap-3 bg-slate-950/50">
              <button
                onClick={handleCopySql}
                className="flex items-center gap-2 bg-fedex-purple hover:bg-purple-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer"
              >
                {hasCopied ? <Check className="w-4 h-4 text-green-300" /> : <Copy className="w-4 h-4" />}
                <span>{hasCopied ? 'Copied to Clipboard!' : 'Copy SQL Query'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
