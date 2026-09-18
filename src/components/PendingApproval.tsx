/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Clock, RefreshCw, LogOut, ShieldAlert, Building2, Mail } from 'lucide-react';

interface PendingApprovalProps {
  email: string;
  userId?: string;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export default function PendingApproval({
  email,
  onRefresh,
  onLogout,
}: PendingApprovalProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    setStatusMessage(null);
    try {
      await onRefresh();
      setStatusMessage('Status checked: Your account is still awaiting administrator activation. Please check back shortly.');
    } catch {
      setStatusMessage('Unable to check approval status. Please check your network connection and try again.');
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden text-[16px]">
      {/* Background Ambience */}
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
          {/* Status Header */}
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(245,158,11,0.2)]">
              <Clock className="text-amber-400 w-8 h-8" />
            </div>
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-bold uppercase tracking-wider mb-3.5">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              Authorization Required
            </div>

            <h1 className="text-white text-2xl md:text-3xl font-black tracking-tight leading-tight">
              Account Pending Approval
            </h1>
            <p className="text-slate-400 text-sm mt-3 leading-relaxed max-w-md font-normal">
              Your account has been registered and is awaiting administrator authorization before accessing the dispatch system and creating shipments.
            </p>
          </div>

          {/* Account Details Card */}
          <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-5 mb-6 space-y-3.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                Registered Email:
              </span>
              <span className="text-white font-bold truncate max-w-[220px]">{email}</span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-3">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                Dispatch Clearance:
              </span>
              <span className="text-amber-400 font-bold">
                Pending Review
              </span>
            </div>

            <div className="flex justify-between items-center text-xs border-t border-slate-800/80 pt-3">
              <span className="text-slate-400 font-medium flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                System Department:
              </span>
              <span className="text-slate-300 font-medium">
                FedEx Dispatch Services
              </span>
            </div>
          </div>

          {/* Status Message */}
          {statusMessage && (
            <motion.div 
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-300 text-center font-medium leading-relaxed"
            >
              {statusMessage}
            </motion.div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleRefreshClick}
              disabled={isRefreshing}
              className="w-full bg-fedex-purple hover:bg-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-fedex-purple/20 text-sm flex items-center justify-center gap-2.5 disabled:opacity-50 cursor-pointer active:scale-[0.99]"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Checking Status...' : 'Check Approval Status'}</span>
            </button>

            <button
              onClick={onLogout}
              className="w-full bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-white font-bold py-3.5 rounded-xl transition-all border border-slate-700 text-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
            >
              <LogOut className="w-4 h-4 text-slate-400" />
              <span>Sign Out</span>
            </button>
          </div>

          {/* Administrator Contact Info */}
          <div className="mt-8 text-center border-t border-slate-800/60 pt-6">
            <p className="text-slate-500 text-xs leading-relaxed">
              Account activation and security permissions are reviewed by your company administrator. Once approved, clicking <strong>Check Approval Status</strong> will grant immediate access.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
