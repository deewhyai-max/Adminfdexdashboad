/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Package, 
  Calendar, 
  Clock, 
  History,
  Save,
  CheckCircle2,
  Truck,
  ChevronRight,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, ShipmentHistoryItem } from '../types';
import { supabase } from '../lib/supabase';

interface ManageShipmentProps {
  shipment: Shipment | null;
  onClose: () => void;
  onUpdate: (updatedShipment: Shipment) => void;
  onSyncComplete: () => void;
  userId: string;
}

const STATUS_OPTIONS: ShipmentStatus[] = [
  'Shipping label created',
  'Package received by FedEx',
  'In Transit',
  'On the way',
  'Out for Delivery',
  'Arriving at destination facility',
  'On Hold',
  'Delivered'
];

export default function ManageShipment({ shipment, onClose, onUpdate, onSyncComplete, userId }: ManageShipmentProps) {
  const [newStatus, setNewStatus] = useState<ShipmentStatus>(shipment?.status || 'Pending');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Editable Core Details
  const [recipient, setRecipient] = useState(shipment?.recipient_name || '');
  const [address, setAddress] = useState(shipment?.destination_address || '');
  const [origin, setOrigin] = useState(shipment?.origin_city_state || '');
  const [valuation, setValuation] = useState(shipment?.asset_value.toString() || '0');
  const [isEditingDocs, setIsEditingDocs] = useState(false);
  const [isSavingDocs, setIsSavingDocs] = useState(false);

  // Sync state with selected shipment
  React.useEffect(() => {
    if (shipment) {
      setNewStatus(shipment.status);
      setRecipient(shipment.recipient_name);
      setAddress(shipment.destination_address);
      setOrigin(shipment.origin_city_state);
      setValuation(shipment.asset_value.toString());
    }
  }, [shipment]);

  const formatTrackingId = (id: string) => {
    return id.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  };

  if (!shipment) return null;

  const handleUpdateCoreDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDocs(true);

    try {
      // --- SESSION CHECK-FIRST PROTOCOL ---
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { user: recoveredUser }, error: recoveryError } = await supabase.auth.getUser();
        if (recoveryError || !recoveredUser) throw new Error('Administrative link broken.');
      }
      // ------------------------------------

      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          recipient_name: recipient,
          destination_address: address,
          origin_city_state: origin,
          asset_value: parseFloat(valuation) || 0
        })
        .eq('id', shipment.id)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const updatedShipment = {
        ...shipment,
        recipient_name: recipient,
        destination_address: address,
        origin_city_state: origin,
        asset_value: parseFloat(valuation) || 0
      };

      onUpdate(updatedShipment);
      setIsEditingDocs(false);
    } catch (err: any) {
      console.error('Core Metadata Update Failure:', err);
    } finally {
      setIsSavingDocs(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setShowSuccess(false);

    const newHistoryItem = {
      timestamp: new Date().toISOString(),
      status_name: newStatus,
      location: location || 'Transit Node',
      description: description || `Operational status shifted to ${newStatus}`,
    };

    const updatedHistory = [newHistoryItem, ...shipment.history];

    try {
      // --- SESSION CHECK-FIRST PROTOCOL ---
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn("Update Protocol: Session missing. Restoring token hierarchy...");
        const { data: { user: recoveredUser }, error: recoveryError } = await supabase.auth.getUser();
        if (recoveryError || !recoveredUser) throw new Error('Administrative link broken. Re-login required.');
      }
      // ------------------------------------

      const { error: updateError } = await supabase
        .from('shipments')
        .update({
          status: newStatus,
          history: updatedHistory
        })
        .eq('id', shipment.id)
        .eq('user_id', userId);

      if (updateError) throw updateError;

      const updatedShipment = {
        ...shipment,
        status: newStatus,
        history: updatedHistory
      };

      onUpdate(updatedShipment);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
      setLocation('');
      setDescription('');
    } catch (err: any) {
      console.error('Core Logic Update Failure:', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Dynamic Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-fedex-purple font-mono text-xs font-black tracking-tighter">#{formatTrackingId(shipment.id)}</span>
            <span className="text-slate-300">/</span>
            <h2 className="text-slate-900 font-black text-sm uppercase tracking-tight truncate">Packet Logic Update</h2>
          </div>
          <p className="text-slate-500 text-[8px] font-black uppercase tracking-[0.3em] truncate">Secure Global Node • {shipment.user_id}</p>
        </div>
        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0 md:bg-slate-50">
          <X className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar bg-slate-50/50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10">
          {/* Left: Update Form */}
          <div className="space-y-8">
            <section>
              <div className="flex items-center gap-2 mb-6 text-slate-900">
                <div className="p-2 bg-fedex-purple/10 rounded-lg">
                  <Truck className="w-4 h-4 text-fedex-purple" />
                </div>
                <h3 className="font-black text-xs uppercase tracking-[0.2em]">Transmission Protocol</h3>
              </div>
              
              <form onSubmit={handleUpdateStatus} className="space-y-6 bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">New Terminal Status</label>
                  <div className="relative">
                    <select 
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as ShipmentStatus)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-fedex-purple/5 focus:border-fedex-purple transition-all font-black text-base text-slate-900 appearance-none shadow-sm"
                    >
                      {STATUS_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                      <ChevronRight className="w-4 h-4 text-slate-400 rotate-90" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Current Coordinates</label>
                    <input 
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="City, State, Country"
                      className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-fedex-purple/5 focus:border-fedex-purple transition-all text-base md:text-lg font-bold text-slate-900 placeholder:text-slate-300 shadow-sm"
                      style={{ fontSize: '16px' }}
                    />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Transmission Log</label>
                  <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Provide detailed transmission metadata..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-fedex-purple/5 focus:border-fedex-purple transition-all text-base md:text-lg font-bold text-slate-900 min-h-[140px] resize-none placeholder:text-slate-300 shadow-sm"
                    style={{ fontSize: '16px' }}
                  />
                </div>

                <div className="space-y-4">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className={`w-full ${showSuccess ? 'bg-green-500' : 'bg-slate-900 hover:bg-black'} text-white font-black py-5 rounded-2xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-[10px] disabled:opacity-50 shadow-xl ${!showSuccess && 'shadow-slate-900/10'}`}
                  >
                    {isSaving ? (
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 animate-spin" />
                        Processing...
                      </div>
                    ) : showSuccess ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4" />
                        Transmission Verified
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Save className="w-4 h-4" />
                        Commit Update
                      </div>
                    )}
                  </button>
                </div>
              </form>
            </section>

            <section className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden">
              <div className="flex justify-between items-center mb-6">
                <h4 className="text-slate-900 font-black text-[10px] uppercase tracking-[0.3em] flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-fedex-purple" />
                  Packet Metadata
                </h4>
                <button 
                  onClick={() => setIsEditingDocs(!isEditingDocs)}
                  className="text-[9px] font-black uppercase tracking-widest text-fedex-purple hover:underline"
                >
                  {isEditingDocs ? 'Cancel Edit' : 'Edit Details'}
                </button>
              </div>

              {isEditingDocs ? (
                <form onSubmit={handleUpdateCoreDetails} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Recipient Name</label>
                    <input 
                      type="text"
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Destination Address</label>
                    <textarea 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900 min-h-[60px] resize-none"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Origin City/State</label>
                    <input 
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Valuation ($)</label>
                    <input 
                      type="number"
                      step="0.01"
                      value={valuation}
                      onChange={(e) => setValuation(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900 font-mono"
                      style={{ fontSize: '16px' }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isSavingDocs}
                    className="w-full bg-fedex-purple text-white font-black py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-[9px] disabled:opacity-50"
                  >
                    {isSavingDocs ? <Activity className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Overwrite Logic Node
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Recipient</span>
                    <span className="text-slate-900 text-xs font-black uppercase">{shipment.recipient_name}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Destination</span>
                    <span className="text-slate-900 text-[10px] font-black uppercase text-right max-w-[150px] leading-tight italic text-slate-500">{shipment.destination_address || 'Unspecified Dest'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Origin</span>
                    <span className="text-slate-900 text-[10px] font-black uppercase text-right">{shipment.origin_city_state || 'Unspecified Origin'}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-slate-400 text-[9px] font-black uppercase tracking-widest">Valuation</span>
                    <span className="text-slate-900 text-xs font-black font-mono tracking-tighter">${shipment.asset_value.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </section>
          </div>

          {/* Right: History */}
          <div className="lg:sticky lg:top-0">
            <h3 className="text-slate-900 font-black text-xs uppercase tracking-[0.2em] mb-8 flex items-center gap-2">
              <div className="p-2 bg-slate-100 rounded-lg">
                <History className="w-4 h-4 text-slate-500" />
              </div>
              Transmission History
            </h3>
            <div className="relative pl-8 space-y-10 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
              {shipment.history.map((item, idx) => (
                <div key={idx} className="relative group">
                  <div className={`absolute -left-[30px] top-1.5 w-5 h-5 rounded-full border-4 border-slate-50 transition-all z-10 ${
                    idx === 0 ? 'bg-fedex-purple ring-4 ring-fedex-purple/10 scale-110' : 'bg-slate-300'
                  }`} />
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded bg-white shadow-sm border ${
                        item.status_name === 'On Hold' 
                          ? 'text-red-600 border-red-200 bg-red-50' 
                          : idx === 0 
                            ? 'text-fedex-purple border-slate-100' 
                            : 'text-slate-400 border-slate-100'
                      }`}>
                        {item.status_name}
                      </span>
                      <span className="text-slate-400 text-[9px] font-bold uppercase tracking-tight">
                        {(() => {
                          const date = new Date(item.timestamp);
                          const d = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                          const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                          return `${d} • ${t}`;
                        })()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-900 text-xs font-black uppercase tracking-tight mb-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-fedex-purple transition-colors" />
                      {item.location}
                    </div>
                    <p className="text-slate-500 text-[11px] font-bold leading-relaxed tracking-tight bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
