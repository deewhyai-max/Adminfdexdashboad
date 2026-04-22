/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Package, 
  MapPin, 
  User, 
  DollarSign, 
  Calendar, 
  Clock,
  ArrowRight,
  Activity,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, ShipmentHistoryItem } from '../types';
import { supabase } from '../lib/supabase';

interface TheForgeProps {
  isOpen: boolean;
  onClose: () => void;
  onShipmentCreated: () => void;
  onOptimisticCreate: (shipment: Shipment) => void;
  userId: string;
}

const FEDEX_ORANGE = '#FF6600';
const FEDEX_PURPLE = '#4D148C';

export default function TheForge({ isOpen, onClose, onShipmentCreated, onOptimisticCreate, userId }: TheForgeProps) {
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('forge_form_cache');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          timeOfEntry: new Date().toISOString().slice(0, 16) // Always refresh time
        };
      } catch (e) {
        console.error("Cache Recovery Failed:", e);
      }
    }
    return {
      recipientName: '',
      destinationAddress: '',
      originCityState: '',
      assetValue: '',
      serviceFee: '',
      timeOfEntry: new Date().toISOString().slice(0, 16),
      estimatedDeliveryDate: '',
    };
  });

  // Percistence Effect
  React.useEffect(() => {
    localStorage.setItem('forge_form_cache', JSON.stringify(formData));
  }, [formData]);

  const [successData, setSuccessData] = useState<{ trackingId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateTrackingId = () => {
    return Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
  };

  const formatTrackingId = (id: string) => {
    return id.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInitializing(true);
    setError(null);
    
    // 1. Generate ID and Prep Data (Synchronous)
    const trackingId = generateTrackingId();
    const firstHistoryEntry: ShipmentHistoryItem = {
      status_name: 'Shipping label created',
      location: 'Origin Facility',
      timestamp: new Date().toISOString(),
      description: 'Initial logistics protocol established. Tracking node active.',
    };

    const dbPayload = {
      id: trackingId,
      user_id: userId,
      recipient_name: formData.recipientName,
      destination_address: formData.destinationAddress,
      origin_city_state: formData.originCityState,
      asset_value: parseFloat(formData.assetValue) || 0,
      service_fee: parseFloat(formData.serviceFee) || 0,
      estimated_delivery_date: formData.estimatedDeliveryDate,
      status: 'Shipping label created' as ShipmentStatus,
      created_at: formData.timeOfEntry ? new Date(formData.timeOfEntry).toISOString() : new Date().toISOString(),
      history: [firstHistoryEntry],
    };

    const newShipment: Shipment = {
      ...dbPayload
    };

    // 2. IMMEDIATE REVEAL (Zero Delay)
    setSuccessData({ trackingId });
    onOptimisticCreate(newShipment);
    onShipmentCreated();
    
    // 3. BACKGROUND SYNC (Session check + Insert)
    // We do NOT await this before showing the success screen
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data: { user: recoveredUser }, error: recoveryError } = await supabase.auth.getUser();
          if (recoveryError || !recoveredUser) {
            console.error("Delayed Sync: No session found.");
            return;
          }
        }
        
        await supabase.from('shipments').insert([dbPayload]);
      } catch (err) {
        console.error('Background Persistence failure:', err);
      } finally {
        setIsInitializing(false);
      }
    })();
  };

  const handleCopy = () => {
    if (successData) {
      navigator.clipboard.writeText(formatTrackingId(successData.trackingId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResetAndClose = () => {
    setFormData({
      recipientName: '',
      destinationAddress: '',
      originCityState: '',
      assetValue: '',
      serviceFee: '',
      timeOfEntry: new Date().toISOString().slice(0, 16),
      estimatedDeliveryDate: '',
    });
    localStorage.removeItem('forge_form_cache');
    setSuccessData(null);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={successData ? undefined : onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40"
          />

          {/* Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed right-0 top-0 h-full w-full md:max-w-xl bg-white shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white sticky top-0 z-10">
              <div className="min-w-0">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 uppercase truncate">
                  The <span className="text-fedex-orange">Forge</span>
                </h2>
                <p className="text-slate-500 text-[9px] md:text-[10px] font-bold uppercase tracking-widest mt-1 truncate">Shipment Initialization Engine</p>
              </div>
              {!successData && (
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-slate-100 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              )}
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-8 relative">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-1 gap-6">
                  {/* Recipient */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <User className="w-3 h-3" /> Recipient Name
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.recipientName}
                      onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                      className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                      placeholder="e.g. John Doe"
                      style={{ fontSize: '16px' }}
                    />
                  </div>

                  {/* Address */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <MapPin className="w-3 h-3" /> Destination Address
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.destinationAddress}
                      onChange={(e) => setFormData({ ...formData, destinationAddress: e.target.value })}
                      className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                      placeholder="Full street address, City, State, Zip"
                      style={{ fontSize: '16px' }}
                    />
                  </div>

                  {/* Origin */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Package className="w-3 h-3" /> Origin City/State
                    </label>
                    <input
                      required
                      type="text"
                      value={formData.originCityState}
                      onChange={(e) => setFormData({ ...formData, originCityState: e.target.value })}
                      className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                      placeholder="City, ST"
                      style={{ fontSize: '16px' }}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Asset Value */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <DollarSign className="w-3 h-3" /> Asset Value
                      </label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={formData.assetValue}
                        onChange={(e) => setFormData({ ...formData, assetValue: e.target.value })}
                        className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                        placeholder="0.00"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    {/* Service Fee */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <DollarSign className="w-3 h-3" /> Service Fee
                      </label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        value={formData.serviceFee}
                        onChange={(e) => setFormData({ ...formData, serviceFee: e.target.value })}
                        className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                        placeholder="0.00"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Time of Entry */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Time of Entry
                      </label>
                      <input
                        required
                        type="datetime-local"
                        value={formData.timeOfEntry}
                        onChange={(e) => setFormData({ ...formData, timeOfEntry: e.target.value })}
                        className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    {/* Est Delivery */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> Est. Delivery
                      </label>
                      <input
                        required
                        type="date"
                        value={formData.estimatedDeliveryDate}
                        onChange={(e) => setFormData({ ...formData, estimatedDeliveryDate: e.target.value })}
                        className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-8">
                  <button
                    type="submit"
                    disabled={isInitializing}
                    className="w-full bg-fedex-orange hover:bg-orange-600 text-white font-black py-5 rounded-2xl transition-all active:scale-[0.98] shadow-xl shadow-fedex-orange/20 flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50 text-sm"
                  >
                    {isInitializing ? (
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 animate-spin" />
                        Synchronizing Cloud...
                      </div>
                    ) : (
                      <><Package className="w-5 h-5" /> Generate Tracking ID <ArrowRight className="w-5 h-5" /></>
                    )}
                  </button>
                </div>
              </form>

              {/* Success Overlay */}
              <AnimatePresence>
                {successData && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    className="absolute inset-0 bg-white z-20 flex flex-col items-center justify-center p-8 text-center"
                  >
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
                      <Check className="text-green-600 w-10 h-10" />
                    </div>
                    
                    <h3 className="text-fedex-orange font-black text-2xl uppercase tracking-tight mb-2">
                      Shipment Initialized
                    </h3>
                    <p className="text-slate-500 text-sm mb-10">Tracking ID generated and logged to global registry.</p>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-8 w-full mb-8">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] block mb-6">Tracking Identifier</span>
                      <div className="flex flex-col md:flex-row items-center justify-center gap-6">
                        <span className="text-4xl md:text-5xl font-black text-slate-900 font-mono tracking-tighter">
                          {formatTrackingId(successData.trackingId)}
                        </span>
                        <button
                          onClick={handleCopy}
                          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shrink-0 ${
                            copied 
                              ? 'bg-green-500 text-white' 
                              : 'bg-fedex-purple text-white hover:bg-purple-700 shadow-lg shadow-fedex-purple/20'
                          }`}
                        >
                          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          {copied ? 'Copied!' : 'Copy ID'}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleResetAndClose}
                      className="w-full border-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white font-black py-5 rounded-2xl transition-all uppercase tracking-widest text-sm"
                    >
                      Done
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
