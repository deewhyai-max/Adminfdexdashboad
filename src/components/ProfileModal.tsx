/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Mail, 
  Phone, 
  Building, 
  MapPin, 
  ShieldCheck, 
  Save, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Activity,
  AtSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  userEmail: string;
  userId: string;
  isPrompt?: boolean;
  onProfileUpdated: (updated: UserProfile) => void;
}

export default function ProfileModal({
  isOpen,
  onClose,
  profile,
  userEmail,
  userId,
  isPrompt = false,
  onProfileUpdated
}: ProfileModalProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setUsername(profile.username || userEmail.split('@')[0] || '');
      setPhone(profile.phone || '');
      setCompany(profile.company || '');
      setAddress(profile.address || '');
    } else {
      setUsername(userEmail.split('@')[0] || '');
    }
  }, [profile, userEmail, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const cleanPhone = phone.trim();

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }

    if (!cleanUsername) {
      setError('Please enter a valid username (letters, numbers, underscores).');
      return;
    }

    if (!cleanPhone) {
      setError('Please enter your contact phone number.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<UserProfile> = {
        name: cleanName,
        username: cleanUsername,
        phone: cleanPhone,
        company: company.trim() || null,
        address: address.trim() || null,
        updated_at: new Date().toISOString()
      };

      // Upsert into public.profiles
      const { data, error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: userId,
          email: userEmail,
          ...payload
        })
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      const updatedProfile: UserProfile = {
        id: userId,
        email: userEmail,
        is_approved: profile?.is_approved ?? true,
        name: cleanName,
        username: cleanUsername,
        phone: cleanPhone,
        company: company.trim() || null,
        address: address.trim() || null,
        ...(data || {})
      };

      onProfileUpdated(updatedProfile);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      setError(err.message || 'Unable to save profile changes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-3xl w-full max-w-lg border border-slate-200 shadow-2xl overflow-hidden my-8"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute right-5 top-5 text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-fedex-purple flex items-center justify-center text-white">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isPrompt ? 'Complete Your Profile' : 'Operator Profile & Settings'}
              </h2>
              <p className="text-xs text-slate-400">
                {isPrompt 
                  ? 'Please fill in your profile details to finalize your account setup.' 
                  : 'Manage your dispatcher information and default dispatch coordinates.'}
              </p>
            </div>
          </div>

          {isPrompt && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Your profile is currently incomplete. Please save your details to proceed.</span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Read-only Email & Approval Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Account Email
              </span>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="truncate">{userEmail}</span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Shipment Authorization
              </span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Approved Operator</span>
              </div>
            </div>
          </div>

          {/* Full Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-fedex-purple" />
              Full Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Robert Smith"
              required
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-fedex-purple/20 focus:border-fedex-purple transition-all"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Username */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <AtSign className="w-3.5 h-3.5 text-fedex-purple" />
              Username <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
              placeholder="e.g. robertsmith"
              required
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-fedex-purple/20 focus:border-fedex-purple transition-all"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Phone Number */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-fedex-purple" />
              Phone Number <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +1 (800) 463-3339"
              required
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-fedex-purple/20 focus:border-fedex-purple transition-all"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Company / Department */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Building className="w-3.5 h-3.5 text-slate-400" />
              Company / Branch <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="e.g. FedEx Logistics Americas"
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-fedex-purple/20 focus:border-fedex-purple transition-all"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Default Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" />
              Default Address / Facility <span className="text-slate-400 text-[11px] font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 3610 Hacks Cross Rd, Memphis, TN 38125"
              className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-fedex-purple/20 focus:border-fedex-purple transition-all"
              style={{ fontSize: '16px' }}
            />
          </div>

          {/* Error / Success Feedback */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>Profile updated successfully!</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 bg-fedex-purple hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-all shadow-md shadow-fedex-purple/20 text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <Activity className="w-4 h-4 animate-spin" />
                  <span>Saving Profile...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
