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
          valuationMode: 'asset',
          packageType: 'Box',
          weight: '',
          length: '',
          width: '',
          height: '',
          numPackages: '1',
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
      valuationMode: 'asset',
      packageType: 'Box',
      weight: '',
      length: '',
      width: '',
      height: '',
      numPackages: '1',
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
    const eventTime = formData.timeOfEntry ? new Date(formData.timeOfEntry).toISOString() : new Date().toISOString();
    
    const firstHistoryEntry: ShipmentHistoryItem = {
      status_name: 'Shipping label created',
      location: 'Origin Facility',
      timestamp: eventTime,
      description: 'Initial logistics protocol established. Tracking node active.',
    };

    const isAssetMode = formData.valuationMode === 'asset';

    const dbPayload = {
      id: trackingId,
      user_id: userId,
      recipient_name: formData.recipientName,
      destination_address: formData.destinationAddress,
      origin_city_state: formData.originCityState,
      asset_value: isAssetMode ? (parseFloat(formData.assetValue) || 0) : 0,
      service_fee: parseFloat(formData.serviceFee) || 0,
      estimated_delivery_date: formData.estimatedDeliveryDate,
      status: 'Shipping label created' as ShipmentStatus,
      created_at: eventTime,
      history: [firstHistoryEntry],
      package_type: isAssetMode ? null : (formData.packageType || 'Box'),
      weight: isAssetMode ? null : (parseFloat(formData.weight) || null),
      length: isAssetMode ? null : (parseFloat(formData.length) || null),
      width: isAssetMode ? null : (parseFloat(formData.width) || null),
      height: isAssetMode ? null : (parseFloat(formData.height) || null),
      num_packages: isAssetMode ? null : (parseInt(formData.numPackages) || null),
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
      valuationMode: 'asset',
      packageType: 'Box',
      weight: '',
      length: '',
      width: '',
      height: '',
      numPackages: '1',
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

                  {/* Cargo Mode Selector */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Package className="w-3 h-3" /> Cargo Mode Selection
                    </label>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, valuationMode: 'asset' })}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                          formData.valuationMode === 'asset'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-950'
                        }`}
                      >
                        Asset Value
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, valuationMode: 'package' })}
                        className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${
                          formData.valuationMode === 'package'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-500 hover:text-slate-950'
                        }`}
                      >
                        Package Details
                      </button>
                    </div>
                  </div>

                  {formData.valuationMode === 'asset' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      {/* Asset Value */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <DollarSign className="w-3 h-3" /> Asset Value
                        </label>
                        <input
                          required={formData.valuationMode === 'asset'}
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
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/50">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Package Specifications</h4>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Package Type */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Package Type</label>
                            <select
                              value={formData.packageType || 'Box'}
                              onChange={(e) => setFormData({ ...formData, packageType: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                            >
                              <option value="Envelope">Envelope</option>
                              <option value="Pak">Pak</option>
                              <option value="Box">Box</option>
                              <option value="Tube">Tube</option>
                              <option value="Your Packaging">Your Packaging</option>
                            </select>
                          </div>

                          {/* Number of Packages */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Num. of Packages</label>
                            <input
                              required={formData.valuationMode === 'package'}
                              type="number"
                              min="1"
                              value={formData.numPackages || '1'}
                              onChange={(e) => setFormData({ ...formData, numPackages: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Weight */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Weight (lbs)</label>
                            <input
                              required={formData.valuationMode === 'package'}
                              type="number"
                              step="0.1"
                              placeholder="0.0"
                              value={formData.weight || ''}
                              onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                            />
                          </div>

                          {/* Dimensions */}
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Dimensions (L x W x H in.)</label>
                            <div className="grid grid-cols-3 gap-1">
                              <input
                                required={formData.valuationMode === 'package'}
                                type="number"
                                placeholder="L"
                                value={formData.length || ''}
                                onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-1 py-3 text-center outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs"
                              />
                              <input
                                required={formData.valuationMode === 'package'}
                                type="number"
                                placeholder="W"
                                value={formData.width || ''}
                                onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-1 py-3 text-center outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs"
                              />
                              <input
                                required={formData.valuationMode === 'package'}
                                type="number"
                                placeholder="H"
                                value={formData.height || ''}
                                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-1 py-3 text-center outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Service Fee */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <DollarSign className="w-3 h-3" /> Service Fee
                        </label>
                        <input
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
                  )}

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
