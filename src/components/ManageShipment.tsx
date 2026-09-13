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
  Activity,
  ShieldCheck,
  Building,
  DollarSign,
  AlertTriangle,
  Snowflake
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, ShipmentHistoryItem } from '../types';
import { supabase } from '../lib/supabase';
import { 
  CURRENCY_OPTIONS, 
  SERVICE_TYPE_OPTIONS, 
  PACKAGE_TYPE_OPTIONS, 
  SIGNATURE_OPTIONS,
  getCurrencySymbol,
  parseAmount,
  parseCount
} from './TheForge';

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
  const [updateTime, setUpdateTime] = useState(new Date().toISOString().slice(0, 16));
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Editable Core & Metadata Details
  const [recipient, setRecipient] = useState(shipment?.recipient_name || '');
  const [address, setAddress] = useState(shipment?.destination_address || '');
  const [origin, setOrigin] = useState(shipment?.origin_city_state || '');
  const [senderName, setSenderName] = useState(shipment?.sender_name || '');
  const [senderAddress, setSenderAddress] = useState(shipment?.sender_address || '');
  const [currency, setCurrency] = useState(shipment?.currency || 'USD');
  const [serviceType, setServiceType] = useState(shipment?.service_type || 'FedEx Priority Overnight');
  const [valuation, setValuation] = useState((shipment?.asset_value ?? 0).toString());
  const [fee, setFee] = useState((shipment?.service_fee ?? 0).toString());
  const [entryTime, setEntryTime] = useState(shipment?.created_at ? new Date(shipment.created_at).toISOString().slice(0, 16) : '');
  const [deliveryDate, setDeliveryDate] = useState(shipment?.estimated_delivery_date || '');

  // Package Specs
  const [packageType, setPackageType] = useState(shipment?.package_type || 'FedEx Box (Small/Medium/Large)');
  const [weight, setWeight] = useState(shipment?.weight != null ? shipment.weight.toString() : '');
  const [weightUnit, setWeightUnit] = useState(shipment?.weight_unit || 'lbs');
  const [length, setLength] = useState(shipment?.length != null ? shipment.length.toString() : '');
  const [width, setWidth] = useState(shipment?.width != null ? shipment.width.toString() : '');
  const [height, setHeight] = useState(shipment?.height != null ? shipment.height.toString() : '');
  const [dimensionUnit, setDimensionUnit] = useState(shipment?.dimension_unit || 'in');
  const [numPackages, setNumPackages] = useState(shipment?.num_packages != null ? shipment.num_packages.toString() : '1');
  const [declaredValue, setDeclaredValue] = useState(shipment?.declared_value != null ? shipment.declared_value.toString() : '');
  const [isDryIce, setIsDryIce] = useState(Boolean(shipment?.is_dry_ice));
  const [isHazardous, setIsHazardous] = useState(Boolean(shipment?.is_hazardous));
  const [isSaturdayDelivery, setIsSaturdayDelivery] = useState(Boolean(shipment?.is_saturday_delivery));
  const [isHoldAtLocation, setIsHoldAtLocation] = useState(Boolean(shipment?.is_hold_at_location));
  const [signatureOption, setSignatureOption] = useState(shipment?.signature_option || 'None');
  
  const [isEditingDocs, setIsEditingDocs] = useState(false);
  const [isSavingDocs, setIsSavingDocs] = useState(false);

  // Sync state with selected shipment
  React.useEffect(() => {
    if (shipment) {
      setNewStatus(shipment.status);
      setRecipient(shipment.recipient_name || '');
      setAddress(shipment.destination_address || '');
      setOrigin(shipment.origin_city_state || '');
      setSenderName(shipment.sender_name || '');
      setSenderAddress(shipment.sender_address || '');
      setCurrency(shipment.currency || 'USD');
      setServiceType(shipment.service_type || 'FedEx Priority Overnight');
      setValuation((shipment.asset_value ?? 0).toString());
      setFee((shipment.service_fee ?? 0).toString());
      setEntryTime(shipment.created_at ? new Date(shipment.created_at).toISOString().slice(0, 16) : '');
      setDeliveryDate(shipment.estimated_delivery_date || '');
      setUpdateTime(new Date().toISOString().slice(0, 16));
      setPackageType(shipment.package_type || 'FedEx Box (Small/Medium/Large)');
      setWeight(shipment.weight != null ? shipment.weight.toString() : '');
      setWeightUnit(shipment.weight_unit || 'lbs');
      setLength(shipment.length != null ? shipment.length.toString() : '');
      setWidth(shipment.width != null ? shipment.width.toString() : '');
      setHeight(shipment.height != null ? shipment.height.toString() : '');
      setDimensionUnit(shipment.dimension_unit || 'in');
      setNumPackages(shipment.num_packages != null ? shipment.num_packages.toString() : '1');
      setDeclaredValue(shipment.declared_value != null ? shipment.declared_value.toString() : '');
      setIsDryIce(Boolean(shipment.is_dry_ice));
      setIsHazardous(Boolean(shipment.is_hazardous));
      setIsSaturdayDelivery(Boolean(shipment.is_saturday_delivery));
      setIsHoldAtLocation(Boolean(shipment.is_hold_at_location));
      setSignatureOption(shipment.signature_option || 'None');
    }
  }, [shipment]);

  const formatTrackingId = (id: string) => {
    return id.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  };

  const activeCurrency = CURRENCY_OPTIONS.find(c => c.code === currency) || CURRENCY_OPTIONS[0];
  const currencySymbol = activeCurrency.symbol;
  const readOnlyCurrencySymbol = getCurrencySymbol(shipment?.currency);

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

      const updatedData: any = {
        recipient_name: recipient && recipient.trim() ? recipient.trim() : 'Unspecified',
        destination_address: address && address.trim() ? address.trim() : null,
        origin_city_state: origin && origin.trim() ? origin.trim() : (senderAddress && senderAddress.trim() ? senderAddress.trim() : (senderName && senderName.trim() ? senderName.trim() : null)),
        sender_name: senderName && senderName.trim() ? senderName.trim() : null,
        sender_address: senderAddress && senderAddress.trim() ? senderAddress.trim() : null,
        currency: currency && currency.trim() ? currency.trim() : 'USD',
        service_type: serviceType && serviceType.trim() ? serviceType.trim() : 'FedEx Priority Overnight',
        asset_value: parseAmount(valuation, 0),
        service_fee: parseAmount(fee, 0),
        created_at: entryTime ? new Date(entryTime).toISOString() : shipment.created_at,
        estimated_delivery_date: deliveryDate && deliveryDate.trim() ? deliveryDate.trim().slice(0, 10) : null,
        package_type: packageType && packageType.trim() ? packageType.trim() : 'Box',
        weight: parseAmount(weight, 0),
        weight_unit: weightUnit && weightUnit.trim() ? weightUnit.trim() : 'lbs',
        length: parseAmount(length, 0),
        width: parseAmount(width, 0),
        height: parseAmount(height, 0),
        dimension_unit: dimensionUnit && dimensionUnit.trim() ? dimensionUnit.trim() : 'in',
        num_packages: parseCount(numPackages, 1),
        declared_value: parseAmount(declaredValue, 0),
        is_dry_ice: Boolean(isDryIce),
        is_hazardous: Boolean(isHazardous),
        is_saturday_delivery: Boolean(isSaturdayDelivery),
        signature_option: signatureOption && signatureOption.trim() ? signatureOption.trim() : 'None',
        is_hold_at_location: Boolean(isHoldAtLocation)
      };

      const { error: updateError } = await supabase
        .from('shipments')
        .update(updatedData)
        .eq('id', shipment.id)
        .eq('user_id', userId);

      if (updateError) {
        console.warn('Initial update notice, verifying migration fallback:', updateError.message);
        if (updateError.message && (updateError.message.includes('column') || updateError.code === 'PGRST204')) {
          const fallbackData = {
            recipient_name: updatedData.recipient_name,
            destination_address: updatedData.destination_address,
            origin_city_state: updatedData.origin_city_state,
            asset_value: updatedData.asset_value,
            service_fee: updatedData.service_fee,
            created_at: updatedData.created_at,
            estimated_delivery_date: updatedData.estimated_delivery_date,
          };
          const { error: fallbackError } = await supabase
            .from('shipments')
            .update(fallbackData)
            .eq('id', shipment.id)
            .eq('user_id', userId);
          if (fallbackError) throw fallbackError;
        } else {
          throw updateError;
        }
      }

      const updatedShipment: Shipment = {
        ...shipment,
        ...updatedData
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
      timestamp: updateTime ? new Date(updateTime).toISOString() : new Date().toISOString(),
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
      setUpdateTime(new Date().toISOString().slice(0, 16));
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
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Status Event Time</label>
                  <input 
                    type="datetime-local"
                    value={updateTime}
                    onChange={(e) => setUpdateTime(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-fedex-purple/5 focus:border-fedex-purple transition-all text-base font-bold text-slate-900 shadow-sm"
                    style={{ fontSize: '16px' }}
                  />
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
                  {/* Service & Sender Node */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex items-center gap-2 text-fedex-purple font-black text-[9px] uppercase tracking-widest">
                      <Building className="w-3.5 h-3.5" />
                      Sender & Service Node
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Service Type</label>
                        <select
                          value={serviceType}
                          onChange={(e) => setServiceType(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-fedex-purple text-xs font-bold text-slate-900"
                        >
                          {SERVICE_TYPE_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Currency</label>
                        <select
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-fedex-purple text-xs font-bold text-slate-900"
                        >
                          {CURRENCY_OPTIONS.map(c => (
                            <option key={c.code} value={c.code}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Sender Name / Company</label>
                        <input 
                          type="text"
                          value={senderName}
                          onChange={(e) => setSenderName(e.target.value)}
                          placeholder="e.g. Apex Logistics HQ"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-fedex-purple text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Sender Address</label>
                        <input 
                          type="text"
                          value={senderAddress}
                          onChange={(e) => setSenderAddress(e.target.value)}
                          placeholder="e.g. 100 Express Blvd, Memphis, TN"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-fedex-purple text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Recipient & Destination Node */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Origin City/State</label>
                      <input 
                        type="text"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
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

                  {/* Valuation & Fee */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Valuation ({currencySymbol})</label>
                      <input 
                        type="number"
                        step="0.01"
                        value={valuation}
                        onChange={(e) => setValuation(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900 font-mono"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Service Fee ({currencySymbol})</label>
                      <input 
                        type="number"
                        step="0.01"
                        value={fee}
                        onChange={(e) => setFee(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900 font-mono"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>

                  {/* Time Nodes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Time of Entry</label>
                      <input 
                        type="datetime-local"
                        value={entryTime}
                        onChange={(e) => setEntryTime(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Est. Delivery</label>
                      <input 
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-purple transition-all text-sm font-bold text-slate-900"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>

                  {/* Package Specs */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex items-center gap-2 text-slate-700 font-black text-[9px] uppercase tracking-widest">
                      <Package className="w-3.5 h-3.5 text-fedex-purple" />
                      Package Specifications
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Package Type</label>
                      <select
                        value={packageType}
                        onChange={(e) => setPackageType(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-fedex-purple text-xs font-bold text-slate-900"
                      >
                        {PACKAGE_TYPE_OPTIONS.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Weight ({weightUnit})</label>
                        <input
                          type="number"
                          step="0.1"
                          value={weight}
                          onChange={(e) => setWeight(e.target.value)}
                          placeholder="Weight"
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Weight Unit</label>
                        <select
                          value={weightUnit}
                          onChange={(e) => setWeightUnit(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                        >
                          <option value="lbs">lbs</option>
                          <option value="kg">kg</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Total Pkgs</label>
                        <input
                          type="number"
                          value={numPackages}
                          onChange={(e) => setNumPackages(e.target.value)}
                          min="1"
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Declared Val ({currencySymbol})</label>
                        <input
                          type="number"
                          step="0.01"
                          value={declaredValue}
                          onChange={(e) => setDeclaredValue(e.target.value)}
                          placeholder="Value"
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">L ({dimensionUnit})</label>
                        <input
                          type="number"
                          value={length}
                          onChange={(e) => setLength(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">W ({dimensionUnit})</label>
                        <input
                          type="number"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">H ({dimensionUnit})</label>
                        <input
                          type="number"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Dim Unit</label>
                        <select
                          value={dimensionUnit}
                          onChange={(e) => setDimensionUnit(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2 py-2 text-xs font-bold text-slate-900"
                        >
                          <option value="in">in</option>
                          <option value="cm">cm</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Special Handling */}
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                    <div className="flex items-center gap-2 text-slate-700 font-black text-[9px] uppercase tracking-widest">
                      <ShieldCheck className="w-3.5 h-3.5 text-fedex-purple" />
                      Special Handling & Security
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[8px] font-black text-slate-400 uppercase tracking-widest block px-1">Signature Option</label>
                      <select
                        value={signatureOption}
                        onChange={(e) => setSignatureOption(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-900"
                      >
                        {SIGNATURE_OPTIONS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-700 pt-1">
                      <label className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
                        <input
                          type="checkbox"
                          checked={isDryIce}
                          onChange={(e) => setIsDryIce(e.target.checked)}
                          className="accent-fedex-purple w-3.5 h-3.5 rounded"
                        />
                        Dry Ice
                      </label>
                      <label className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
                        <input
                          type="checkbox"
                          checked={isHazardous}
                          onChange={(e) => setIsHazardous(e.target.checked)}
                          className="accent-fedex-purple w-3.5 h-3.5 rounded"
                        />
                        Hazardous Materials
                      </label>
                      <label className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
                        <input
                          type="checkbox"
                          checked={isSaturdayDelivery}
                          onChange={(e) => setIsSaturdayDelivery(e.target.checked)}
                          className="accent-fedex-purple w-3.5 h-3.5 rounded"
                        />
                        Saturday Delivery
                      </label>
                      <label className="flex items-center gap-2 bg-white p-2.5 rounded-xl border border-slate-200 cursor-pointer hover:border-slate-300">
                        <input
                          type="checkbox"
                          checked={isHoldAtLocation}
                          onChange={(e) => setIsHoldAtLocation(e.target.checked)}
                          className="accent-fedex-purple w-3.5 h-3.5 rounded"
                        />
                        Hold At Location
                      </label>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingDocs}
                    className="w-full bg-fedex-purple hover:bg-purple-700 text-white font-black py-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 uppercase tracking-widest text-[9px] disabled:opacity-50 shadow-md shadow-fedex-purple/20"
                  >
                    {isSavingDocs ? <Activity className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Commit Metadata Node
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  {/* Sender & Service Details */}
                  {(shipment.sender_name || shipment.service_type || shipment.currency) && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-fedex-purple text-[8px] font-black uppercase tracking-widest">Service & Sender Node</span>
                        {shipment.currency && (
                          <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-700">
                            {shipment.currency}
                          </span>
                        )}
                      </div>
                      {shipment.service_type && (
                        <div className="text-slate-900 text-[11px] font-black">{shipment.service_type}</div>
                      )}
                      {shipment.sender_name && (
                        <div className="text-[10px] text-slate-600 font-medium">
                          <span className="font-bold text-slate-800">Sender: </span>{shipment.sender_name}
                          {shipment.sender_address ? ` • ${shipment.sender_address}` : ''}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Recipient</span>
                      <span className="text-slate-900 text-[11px] font-black uppercase truncate block">{shipment.recipient_name}</span>
                    </div>
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Origin</span>
                      <span className="text-slate-900 text-[11px] font-black uppercase truncate block">{shipment.origin_city_state || 'N/A'}</span>
                    </div>
                  </div>

                  <div className="py-2 border-b border-slate-50">
                    <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Destination</span>
                    <span className="text-slate-900 text-[10px] font-black uppercase italic text-slate-500 leading-tight block">{shipment.destination_address || 'Unspecified'}</span>
                  </div>

                  {/* Package Specs if available */}
                  {(shipment.package_type || (shipment.weight && shipment.weight > 0) || (shipment.declared_value && shipment.declared_value > 0)) && (
                    <div className="py-2 border-b border-slate-50 space-y-1.5">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block">Package Specs</span>
                      <div className="text-[10px] text-slate-700 font-medium space-x-2">
                        {shipment.package_type && <span className="font-bold text-slate-900">{shipment.package_type}</span>}
                        {shipment.weight ? <span>• {shipment.weight} {shipment.weight_unit || 'lbs'}</span> : null}
                        {shipment.length && shipment.width && shipment.height ? (
                          <span>• {shipment.length}x{shipment.width}x{shipment.height} {shipment.dimension_unit || 'in'}</span>
                        ) : null}
                        {shipment.num_packages && shipment.num_packages > 1 ? (
                          <span>• {shipment.num_packages} pkgs</span>
                        ) : null}
                      </div>
                      {shipment.declared_value ? (
                        <div className="text-[9px] text-slate-500 font-bold">
                          Declared Value: {readOnlyCurrencySymbol}{shipment.declared_value.toLocaleString()}
                        </div>
                      ) : null}
                    </div>
                  )}

                  {/* Special Handling Badges */}
                  {(shipment.is_dry_ice || shipment.is_hazardous || shipment.is_saturday_delivery || shipment.is_hold_at_location || (shipment.signature_option && shipment.signature_option !== 'None')) && (
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1.5">Special Handling</span>
                      <div className="flex flex-wrap gap-1.5">
                        {shipment.is_dry_ice && (
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-[8px] font-black uppercase">Dry Ice</span>
                        )}
                        {shipment.is_hazardous && (
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-md text-[8px] font-black uppercase">Hazardous</span>
                        )}
                        {shipment.is_saturday_delivery && (
                          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[8px] font-black uppercase">Sat Delivery</span>
                        )}
                        {shipment.is_hold_at_location && (
                          <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-[8px] font-black uppercase">Hold At Location</span>
                        )}
                        {shipment.signature_option && shipment.signature_option !== 'None' && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[8px] font-black uppercase">Sig: {shipment.signature_option}</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Valuation</span>
                      <span className="text-slate-900 text-[11px] font-black font-mono tracking-tighter block">
                        {readOnlyCurrencySymbol}{(shipment.asset_value ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="py-2 border-b border-slate-50">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Service Fee</span>
                      <span className="text-slate-900 text-[11px] font-black font-mono tracking-tighter block">
                        {readOnlyCurrencySymbol}{(shipment.service_fee ?? 0).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="py-2">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Entry Time</span>
                      <span className="text-slate-900 text-[9px] font-black uppercase block">
                        {new Date(shipment.created_at).toLocaleDateString()} {new Date(shipment.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                    </div>
                    <div className="py-2">
                      <span className="text-slate-400 text-[8px] font-black uppercase tracking-widest block mb-1">Est. Delivery</span>
                      <span className="text-slate-900 text-[10px] font-black uppercase block">{shipment.estimated_delivery_date || 'N/A'}</span>
                    </div>
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
