/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Mail, 
  Phone, 
  ShieldCheck, 
  Save, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  Activity,
  AtSign,
  ChevronDown,
  Search,
  Building,
  MapPin
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../types';
import { COUNTRY_CODES, CountryCode, findCountryByDialCode } from '../constants/countryCodes';

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
  
  // Country code + phone states
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>(COUNTRY_CODES[0]); // Default US (+1)
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isCountryDropdownOpen, setIsCountryDropdownOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  // Optional company & address (default null)
  const [showOptionalFields, setShowOptionalFields] = useState(false);
  const [company, setCompany] = useState('');
  const [address, setAddress] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close country dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsCountryDropdownOpen(false);
      }
    }
    if (isCountryDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opening dropdown
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCountryDropdownOpen]);

  // Load profile data on open or change
  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setUsername(profile.username || userEmail.split('@')[0] || '');
      setCompany(profile.company || '');
      setAddress(profile.address || '');

      if (profile.company || profile.address) {
        setShowOptionalFields(true);
      }

      // Parse existing phone number with country code
      if (profile.phone) {
        const parsed = findCountryByDialCode(profile.phone);
        if (parsed) {
          setSelectedCountry(parsed.country);
          setPhoneNumber(parsed.localNumber);
        } else {
          setPhoneNumber(profile.phone);
        }
      } else {
        setPhoneNumber('');
      }
    } else {
      setUsername(userEmail.split('@')[0] || '');
      setPhoneNumber('');
    }
  }, [profile, userEmail, isOpen]);

  if (!isOpen) return null;

  // Filter countries by name or dial code
  const filteredCountries = COUNTRY_CODES.filter((c) => {
    const q = countrySearch.toLowerCase().trim();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.dialCode.includes(q) ||
      c.code.toLowerCase().includes(q)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const cleanName = name.trim();
    const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
    const cleanPhoneDigits = phoneNumber.trim().replace(/[^\d]/g, '');

    if (!cleanName) {
      setError('Please enter your full name.');
      return;
    }

    if (!cleanUsername) {
      setError('Please enter a valid username (letters, numbers, underscores).');
      return;
    }

    if (!cleanPhoneDigits || cleanPhoneDigits.length < 5) {
      setError('Please enter a valid phone number (at least 5 digits).');
      return;
    }

    // Form combined international phone number
    const fullPhoneNumber = `${selectedCountry.dialCode} ${phoneNumber.trim()}`;

    setIsSaving(true);
    try {
      // Clean payload: company and address are null if left blank
      const payload: Partial<UserProfile> = {
        name: cleanName,
        username: cleanUsername,
        phone: fullPhoneNumber,
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
        phone: fullPhoneNumber,
        company: company.trim() || null,
        address: address.trim() || null,
        ...(data || {})
      };

      onProfileUpdated(updatedProfile);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
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
            <div className="w-10 h-10 rounded-xl bg-fedex-purple flex items-center justify-center text-white font-bold">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isPrompt ? 'Complete Your Profile' : 'User Profile & Settings'}
              </h2>
              <p className="text-xs text-slate-400">
                {isPrompt 
                  ? 'Please provide your contact details to finish setting up your account.' 
                  : 'Manage your contact details and dispatch information.'}
              </p>
            </div>
          </div>

          {isPrompt && (
            <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>Your profile is incomplete. Please enter your name, username, and phone number.</span>
            </div>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Read-only Email & Verification */}
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
                Dispatch Authorization
              </span>
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Verified Dispatcher</span>
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

          {/* Phone Number with International Country Code Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-fedex-purple" />
                Phone Number <span className="text-red-500">*</span>
              </span>
              <span className="text-[11px] text-slate-400 font-normal">Select country code</span>
            </label>

            <div className="flex items-center gap-2 relative">
              {/* Country Code Picker Dropdown Trigger */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => {
                    setIsCountryDropdownOpen(!isCountryDropdownOpen);
                    setCountrySearch('');
                  }}
                  className="h-11 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-xl flex items-center gap-2 text-xs font-bold text-slate-800 transition-colors cursor-pointer shrink-0"
                >
                  <span className="text-base">{selectedCountry.flag}</span>
                  <span className="font-mono text-slate-900">{selectedCountry.dialCode}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Searchable Dropdown Menu */}
                <AnimatePresence>
                  {isCountryDropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute left-0 top-full mt-1.5 w-72 max-h-72 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 overflow-hidden flex flex-col"
                    >
                      {/* Search Bar inside dropdown */}
                      <div className="p-2.5 border-b border-slate-100 bg-slate-50">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          <input
                            ref={searchInputRef}
                            type="text"
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Search country or code..."
                            className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-900 focus:outline-none focus:border-fedex-purple"
                          />
                        </div>
                      </div>

                      {/* Country List */}
                      <div className="overflow-y-auto flex-1 p-1 divide-y divide-slate-50">
                        {filteredCountries.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-400">
                            No countries found
                          </div>
                        ) : (
                          filteredCountries.map((c) => (
                            <button
                              key={`${c.code}-${c.dialCode}`}
                              type="button"
                              onClick={() => {
                                setSelectedCountry(c);
                                setIsCountryDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-left flex items-center justify-between rounded-lg text-xs transition-colors cursor-pointer ${
                                selectedCountry.code === c.code && selectedCountry.dialCode === c.dialCode
                                  ? 'bg-fedex-purple/10 text-fedex-purple font-bold'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <span className="text-base shrink-0">{c.flag}</span>
                                <span className="truncate">{c.name}</span>
                              </div>
                              <span className="font-mono text-slate-500 shrink-0 ml-2 font-semibold">
                                {c.dialCode}
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Local Phone Number Input */}
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="e.g. (800) 463-3339"
                required
                className="flex-1 h-11 bg-white border border-slate-300 rounded-xl px-4 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-fedex-purple/20 focus:border-fedex-purple transition-all"
                style={{ fontSize: '16px' }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              International format preview: <strong className="text-slate-600 font-mono">{selectedCountry.dialCode} {phoneNumber || '...'}</strong>
            </p>
          </div>

          {/* Optional Details Toggle */}
          <div className="pt-1">
            {!showOptionalFields ? (
              <button
                type="button"
                onClick={() => setShowOptionalFields(true)}
                className="text-xs font-semibold text-fedex-purple hover:text-purple-800 transition-colors flex items-center gap-1 cursor-pointer"
              >
                + Add Company or Address (Optional)
              </button>
            ) : (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Optional Details (Saved as null if left blank)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCompany('');
                      setAddress('');
                      setShowOptionalFields(false);
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    Hide
                  </button>
                </div>

                {/* Company / Branch */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Building className="w-3.5 h-3.5 text-slate-400" />
                    Company / Branch
                  </label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. FedEx Logistics Americas (Optional)"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-fedex-purple transition-all"
                  />
                </div>

                {/* Default Address */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    Default Address / Facility
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. 3610 Hacks Cross Rd, Memphis, TN 38125 (Optional)"
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium text-slate-900 focus:outline-none focus:border-fedex-purple transition-all"
                  />
                </div>
              </div>
            )}
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
          <div className="pt-2 flex gap-3">
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
