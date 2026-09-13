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
  ShieldAlert,
  Building,
  Truck,
  ShieldCheck,
  AlertTriangle,
  Snowflake,
  FileSignature,
  Scale,
  Maximize2,
  Coins,
  Route,
  Play,
  Pause,
  RefreshCw,
  Edit3,
  Sliders,
  ChevronDown,
  ChevronUp,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, ShipmentHistoryItem, RouteWaypoint } from '../types';
import { supabase } from '../lib/supabase';
import { CURRENCY_OPTIONS, CurrencyOption, getCurrencySymbol } from '../constants/currencies';
import { 
  generate8StageRoute, 
  calculateFedExRouteWithAI, 
  calculate8StageSpacedTimestamps,
  FEDEX_8_STAGES 
} from '../utils/routeGenerator';

export { CURRENCY_OPTIONS, getCurrencySymbol };
export type { CurrencyOption };

const getDefaultDeliveryDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  return d.toISOString().slice(0, 10);
};

interface TheForgeProps {
  isOpen: boolean;
  onClose: () => void;
  onShipmentCreated: () => void;
  onOptimisticCreate: (shipment: Shipment) => void;
  userId: string;
}

export const SERVICE_TYPE_OPTIONS = [
  'FedEx Priority Overnight',
  'FedEx Standard Overnight',
  'FedEx 2Day',
  'FedEx Ground',
  'FedEx Express Saver',
  'FedEx First Overnight',
  'FedEx International Priority',
  'FedEx International Economy',
  'FedEx International First',
  'FedEx Home Delivery',
];

export const PACKAGE_TYPE_OPTIONS = [
  'FedEx Envelope',
  'FedEx Pak',
  'FedEx Box (Small/Medium/Large)',
  'FedEx Tube',
  'Your Packaging (custom box)',
];

export const SIGNATURE_OPTIONS = [
  'None',
  'Direct',
  'Indirect',
  'Adult',
];

export const parseAmount = (val: any, fallback = 0): number => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    const cleaned = trimmed.replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
};

export const parseCount = (val: any, fallback = 1): number => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'number') return isNaN(val) ? fallback : Math.round(val);
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return fallback;
    const cleaned = trimmed.replace(/[^0-9-]/g, '');
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
};

export default function TheForge({ isOpen, onClose, onShipmentCreated, onOptimisticCreate, userId }: TheForgeProps) {
  const [formData, setFormData] = useState(() => {
    const saved = localStorage.getItem('forge_form_cache');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          senderName: '',
          senderAddress: '',
          recipientName: '',
          destinationAddress: '',
          originCityState: '',
          currency: 'USD',
          serviceType: 'FedEx Priority Overnight',
          valuationMode: 'asset' as 'asset' | 'package',
          assetValue: '',
          serviceFee: '',
          packageType: 'FedEx Box (Small/Medium/Large)',
          weight: '',
          weightUnit: 'lbs' as 'lbs' | 'kg',
          length: '',
          width: '',
          height: '',
          dimensionUnit: 'in' as 'in' | 'cm',
          numPackages: '1',
          declaredValue: '',
          isDryIce: false,
          isHazardous: false,
          isSaturdayDelivery: false,
          signatureOption: 'None',
          isHoldAtLocation: false,
          autoAdvance: true,
          isOnHold: false,
          ...parsed,
          timeOfEntry: new Date().toISOString().slice(0, 16), // Always refresh time
          estimatedDeliveryDate: (parsed.estimatedDeliveryDate && parsed.estimatedDeliveryDate >= new Date().toISOString().slice(0, 10))
            ? parsed.estimatedDeliveryDate
            : getDefaultDeliveryDate()
        };
      } catch (e) {
        console.error("Cache Recovery Failed:", e);
      }
    }
    return {
      senderName: '',
      senderAddress: '',
      recipientName: '',
      destinationAddress: '',
      originCityState: '',
      currency: 'USD',
      serviceType: 'FedEx Priority Overnight',
      valuationMode: 'asset' as 'asset' | 'package',
      assetValue: '',
      serviceFee: '',
      packageType: 'FedEx Box (Small/Medium/Large)',
      weight: '',
      weightUnit: 'lbs' as 'lbs' | 'kg',
      length: '',
      width: '',
      height: '',
      dimensionUnit: 'in' as 'in' | 'cm',
      numPackages: '1',
      declaredValue: '',
      isDryIce: false,
      isHazardous: false,
      isSaturdayDelivery: false,
      signatureOption: 'None',
      isHoldAtLocation: false,
      autoAdvance: true,
      isOnHold: false,
      timeOfEntry: new Date().toISOString().slice(0, 16),
      estimatedDeliveryDate: getDefaultDeliveryDate(),
    };
  });

  // Persistence Effect
  React.useEffect(() => {
    localStorage.setItem('forge_form_cache', JSON.stringify(formData));
  }, [formData]);

  const [successData, setSuccessData] = useState<{ trackingId: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 8-Stage Milestone & Route States
  const [milestones, setMilestones] = useState<ShipmentHistoryItem[]>([]);
  const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>([]);
  const [isRouteGenerated, setIsRouteGenerated] = useState(false);
  const [showMilestonesEditor, setShowMilestonesEditor] = useState(false);
  const [editingMilestoneIdx, setEditingMilestoneIdx] = useState<number | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [aiHubName, setAiHubName] = useState<string | null>(null);
  const [aiRoutingSummary, setAiRoutingSummary] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState<boolean>(false);

  const handleGenerateRoute = async () => {
    setIsCalculatingRoute(true);
    try {
      const plan = await calculateFedExRouteWithAI({
        origin: formData.originCityState || formData.senderAddress,
        senderAddress: formData.senderAddress,
        destination: formData.destinationAddress,
        recipientName: formData.recipientName,
        senderName: formData.senderName,
        serviceType: formData.serviceType,
        packageType: formData.packageType,
        weight: parseAmount(formData.weight, 0),
        weightUnit: formData.weightUnit,
        startTime: formData.timeOfEntry,
        estimatedDeliveryDate: formData.estimatedDeliveryDate,
        isDryIce: formData.isDryIce,
        isHazardous: formData.isHazardous,
        isSaturdayDelivery: formData.isSaturdayDelivery
      });
      setMilestones(plan.history);
      setRouteWaypoints(plan.route_waypoints);
      setAiHubName(plan.hub_name || null);
      setAiRoutingSummary(plan.routing_summary || null);
      setIsAiGenerated(Boolean(plan.ai_generated));
      setIsRouteGenerated(true);
      setShowMilestonesEditor(true);
    } catch (err) {
      console.error("Route generation error:", err);
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  const handleMilestoneChange = (index: number, field: keyof ShipmentHistoryItem, value: string) => {
    setMilestones(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value
      };
      return updated;
    });
    if (field === 'location' || field === 'status_name' || field === 'timestamp') {
      setRouteWaypoints(prev => {
        const updated = [...prev];
        if (updated[index]) {
          updated[index] = {
            ...updated[index],
            location: field === 'location' ? value : updated[index].location,
            stage_name: field === 'status_name' ? (value as ShipmentStatus) : updated[index].stage_name,
            estimated_time: field === 'timestamp' ? value : updated[index].estimated_time
          };
        }
        return updated;
      });
    }
  };

  const generateTrackingId = () => {
    return Math.floor(Math.random() * 1000000000000).toString().padStart(12, '0');
  };

  const formatTrackingId = (id: string) => {
    return id.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
  };

  const selectedCurrency = CURRENCY_OPTIONS.find(c => c.code === formData.currency) || CURRENCY_OPTIONS[0];
  const currencySymbol = selectedCurrency.symbol;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInitializing(true);
    setError(null);
    
    // 1. Core Identifiers & Required Fields:
    // id: 12-digit tracking number string
    // user_id: Current logged-in user UUID
    // recipient_name: Receiver Name (string, fallback to 'Unspecified')
    // destination_address: Delivery Address (string or null)
    // status: 'Shipping label created'
    // history: Array containing the initial timeline event JSON object
    // created_at: Current ISO timestamp string
    const trackingId = generateTrackingId();
    const eventTime = formData.timeOfEntry ? new Date(formData.timeOfEntry).toISOString() : new Date().toISOString();
    
    // 2. Sender Details:
    // sender_name: Sender Name (string or null)
    // sender_address: Sender Address (string or null)
    // origin_city_state: Sender Address / Origin (string or null)
    const senderName = formData.senderName && formData.senderName.trim() ? formData.senderName.trim() : null;
    const senderAddress = formData.senderAddress && formData.senderAddress.trim() ? formData.senderAddress.trim() : null;
    const originCityState = formData.originCityState && formData.originCityState.trim()
      ? formData.originCityState.trim()
      : (senderAddress || senderName || null);

    const recipientName = formData.recipientName && formData.recipientName.trim() ? formData.recipientName.trim() : 'Unspecified';
    const destinationAddress = formData.destinationAddress && formData.destinationAddress.trim() ? formData.destinationAddress.trim() : null;

    // 3. Financial & Service Settings:
    const currency = formData.currency && formData.currency.trim() ? formData.currency.trim() : 'USD';
    const serviceType = formData.serviceType && formData.serviceType.trim() ? formData.serviceType.trim() : 'FedEx Priority Overnight';
    const assetValue = parseAmount(formData.assetValue, 0);
    const serviceFee = parseAmount(formData.serviceFee, 0);
    const declaredValue = parseAmount(formData.declaredValue, 0);
    const estimatedDeliveryDate = formData.estimatedDeliveryDate && formData.estimatedDeliveryDate.trim()
      ? formData.estimatedDeliveryDate.trim().slice(0, 10)
      : null;

    // 4. Package Specifications:
    const packageType = formData.packageType && formData.packageType.trim() ? formData.packageType.trim() : 'Box';
    const weight = parseAmount(formData.weight, 0);
    const weightUnit = formData.weightUnit && formData.weightUnit.trim() ? formData.weightUnit.trim() : 'lbs';
    const length = parseAmount(formData.length, 0);
    const width = parseAmount(formData.width, 0);
    const height = parseAmount(formData.height, 0);
    const dimensionUnit = formData.dimensionUnit && formData.dimensionUnit.trim() ? formData.dimensionUnit.trim() : 'in';
    const numPackages = parseCount(formData.numPackages, 1);

    // 5. Special Handling Options:
    const isDryIce = Boolean(formData.isDryIce);
    const isHazardous = Boolean(formData.isHazardous);
    const isSaturdayDelivery = Boolean(formData.isSaturdayDelivery);
    const signatureOption = formData.signatureOption && formData.signatureOption.trim() ? formData.signatureOption.trim() : 'None';
    const isHoldAtLocation = Boolean(formData.isHoldAtLocation);

    // 6. Automated Route & 8-Stage Timeline Integration:
    let finalHistory = milestones;
    let finalWaypoints = routeWaypoints;
    if (!finalHistory || finalHistory.length !== 8) {
      const plan = await calculateFedExRouteWithAI({
        origin: originCityState || senderAddress || 'Origin Facility',
        senderAddress: senderAddress || undefined,
        destination: destinationAddress || 'Destination Address',
        recipientName: recipientName,
        senderName: senderName || undefined,
        serviceType: serviceType,
        packageType: packageType,
        weight: weight,
        weightUnit: weightUnit,
        startTime: eventTime,
        estimatedDeliveryDate: estimatedDeliveryDate || undefined,
        isDryIce: isDryIce,
        isHazardous: isHazardous,
        isSaturdayDelivery: isSaturdayDelivery
      });
      finalHistory = plan.history;
      finalWaypoints = plan.route_waypoints;
    }

    // Strictly enforce Fixed Timestamp Spacing Rules before saving to Supabase:
    // Stage 1 = NOW() (eventTime), Stages 2-7 = evenly distributed future timestamps, Stage 8 = estimated delivery target
    const guaranteedTimestamps = calculate8StageSpacedTimestamps(eventTime, estimatedDeliveryDate || undefined);
    finalHistory = finalHistory.map((item, idx) => ({
      ...item,
      timestamp: guaranteedTimestamps[idx]
    }));
    finalWaypoints = (finalWaypoints && finalWaypoints.length === 8 ? finalWaypoints : finalHistory).map((item, idx) => ({
      ...item,
      estimated_time: guaranteedTimestamps[idx]
    }));

    const isOnHold = Boolean(formData.isOnHold);
    const autoAdvance = Boolean(formData.autoAdvance);

    const dbPayload = {
      id: trackingId,
      user_id: userId,
      recipient_name: recipientName,
      destination_address: destinationAddress,
      origin_city_state: originCityState,
      asset_value: assetValue,
      service_fee: serviceFee,
      status: (finalHistory[0]?.status_name || 'Shipping label created') as ShipmentStatus,
      history: finalHistory,
      estimated_delivery_date: estimatedDeliveryDate,
      created_at: eventTime,
      package_type: packageType,
      weight,
      length,
      width,
      height,
      num_packages: numPackages,
      sender_name: senderName,
      sender_address: senderAddress,
      currency,
      service_type: serviceType,
      weight_unit: weightUnit,
      dimension_unit: dimensionUnit,
      declared_value: declaredValue,
      is_dry_ice: isDryIce,
      is_hazardous: isHazardous,
      is_saturday_delivery: isSaturdayDelivery,
      signature_option: signatureOption,
      is_hold_at_location: isHoldAtLocation,
      is_on_hold: isOnHold,
      auto_advance: autoAdvance,
      route_waypoints: finalWaypoints,
    };

    const newShipment: Shipment = {
      ...dbPayload
    };

    // 2. IMMEDIATE REVEAL (Zero Delay)
    setSuccessData({ trackingId });
    onOptimisticCreate(newShipment);
    onShipmentCreated();
    
    // 3. BACKGROUND SYNC (Session check + Insert with Schema Graceful Fallback)
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
        
        const { error: insertError } = await supabase.from('shipments').insert([dbPayload]);
        if (insertError) {
          console.warn('Initial insert warning, checking if migration fallback needed:', insertError.message);
          // If table columns have not been migrated yet, safely fallback to core schema fields
          if (insertError.message && (insertError.message.includes('column') || insertError.code === 'PGRST204')) {
            const fallbackPayload = {
              id: trackingId,
              user_id: userId,
              recipient_name: dbPayload.recipient_name,
              destination_address: dbPayload.destination_address,
              origin_city_state: dbPayload.origin_city_state,
              asset_value: dbPayload.asset_value,
              service_fee: dbPayload.service_fee,
              estimated_delivery_date: dbPayload.estimated_delivery_date,
              status: dbPayload.status,
              created_at: dbPayload.created_at,
              history: dbPayload.history,
              package_type: dbPayload.package_type,
              weight: dbPayload.weight,
              length: dbPayload.length,
              width: dbPayload.width,
              height: dbPayload.height,
              num_packages: dbPayload.num_packages,
            };
            await supabase.from('shipments').insert([fallbackPayload]);
          }
        }
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
      senderName: '',
      senderAddress: '',
      recipientName: '',
      destinationAddress: '',
      originCityState: '',
      currency: 'USD',
      serviceType: 'FedEx Priority Overnight',
      valuationMode: 'asset',
      assetValue: '',
      serviceFee: '',
      packageType: 'FedEx Box (Small/Medium/Large)',
      weight: '',
      weightUnit: 'lbs',
      length: '',
      width: '',
      height: '',
      dimensionUnit: 'in',
      numPackages: '1',
      declaredValue: '',
      isDryIce: false,
      isHazardous: false,
      isSaturdayDelivery: false,
      signatureOption: 'None',
      isHoldAtLocation: false,
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
            <div className="flex-1 overflow-y-auto p-6 md:p-8 relative">
              <form onSubmit={handleSubmit} className="space-y-6">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    {error}
                  </div>
                )}
                
                <div className="grid grid-cols-1 gap-6">

                  {/* 1. Service Type & Currency Header Section */}
                  <div className="space-y-4 bg-slate-50/70 border border-slate-200/80 rounded-2xl p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      {/* Service Type */}
                      <div className="flex-1 space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Truck className="w-3.5 h-3.5 text-fedex-purple" /> Service Type
                        </label>
                        <select
                          value={formData.serviceType}
                          onChange={(e) => setFormData({ ...formData, serviceType: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-bold text-xs"
                        >
                          {SERVICE_TYPE_OPTIONS.map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </div>

                      {/* Currency Dropdown Selector */}
                      <div className="space-y-1.5 sm:w-56">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <Coins className="w-3.5 h-3.5 text-fedex-orange" /> Currency
                        </label>
                        <select
                          value={formData.currency}
                          onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-black text-xs"
                        >
                          {CURRENCY_OPTIONS.map((curr) => (
                            <option key={curr.code} value={curr.code}>
                              {curr.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* 2. Sender Details (Origin Hub) */}
                  <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/40">
                    <div className="flex items-center gap-2">
                      <Building className="w-3.5 h-3.5 text-fedex-purple" />
                      <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Sender Details (Origin)</h4>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                          Sender Name / Company
                        </label>
                        <input
                          type="text"
                          value={formData.senderName}
                          onChange={(e) => setFormData({ ...formData, senderName: e.target.value, originCityState: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                          placeholder="e.g. FedEx Global Express Hub / John Enterprise"
                          style={{ fontSize: '16px' }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-slate-400" /> Sender Address
                        </label>
                        <input
                          type="text"
                          value={formData.senderAddress}
                          onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                          placeholder="Street, City, State, ZIP (e.g. 3610 Hacks Cross Rd, Memphis, TN)"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Recipient Details (Destination Point) */}
                  <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/40">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-fedex-orange" />
                      <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Recipient Details (Destination)</h4>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                          Recipient Name
                        </label>
                        <input
                          type="text"
                          value={formData.recipientName}
                          onChange={(e) => setFormData({ ...formData, recipientName: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                          placeholder="e.g. John Doe"
                          style={{ fontSize: '16px' }}
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <MapPin className="w-3 h-3 text-slate-400" /> Destination Address
                        </label>
                        <input
                          type="text"
                          value={formData.destinationAddress}
                          onChange={(e) => setFormData({ ...formData, destinationAddress: e.target.value })}
                          className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                          placeholder="Full street address, City, State, Zip"
                          style={{ fontSize: '16px' }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. Cargo Mode Selector */}
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <Package className="w-3 h-3" /> Valuation & Specifications Mode
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
                        Package Specifications
                      </button>
                    </div>
                  </div>

                  {/* 5. Mode Body */}
                  {formData.valuationMode === 'asset' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50/50 border border-slate-100 p-5 rounded-2xl">
                      {/* Asset Value */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <DollarSign className="w-3 h-3 text-fedex-orange" /> Asset Value ({formData.currency})
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.assetValue}
                            onChange={(e) => setFormData({ ...formData, assetValue: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-8 pr-3 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-bold text-sm font-mono"
                            placeholder="0.00"
                            style={{ fontSize: '16px' }}
                          />
                        </div>
                      </div>
                      {/* Service Fee */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <DollarSign className="w-3 h-3 text-fedex-purple" /> Service Fee ({formData.currency})
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm pointer-events-none">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            value={formData.serviceFee}
                            onChange={(e) => setFormData({ ...formData, serviceFee: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-8 pr-3 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-bold text-sm font-mono"
                            placeholder="0.00"
                            style={{ fontSize: '16px' }}
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/50">
                        <div className="flex items-center justify-between">
                          <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em] flex items-center gap-2">
                            <Package className="w-3.5 h-3.5 text-fedex-orange" /> Package Specifications
                          </h4>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Package Type */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Package Type</label>
                            <select
                              value={formData.packageType || 'FedEx Box (Small/Medium/Large)'}
                              onChange={(e) => setFormData({ ...formData, packageType: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs"
                            >
                              {PACKAGE_TYPE_OPTIONS.map((pt) => (
                                <option key={pt} value={pt}>{pt}</option>
                              ))}
                            </select>
                          </div>

                          {/* Number of Packages */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Num. of Packages</label>
                            <input
                              type="number"
                              min="1"
                              value={formData.numPackages || '1'}
                              onChange={(e) => setFormData({ ...formData, numPackages: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {/* Weight with Unit Toggle */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Scale className="w-3 h-3 text-slate-400" /> Weight
                              </label>
                              <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, weightUnit: 'lbs' })}
                                  className={`px-2 py-0.5 rounded-md transition-all ${
                                    formData.weightUnit === 'lbs' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                                  }`}
                                >
                                  lbs
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, weightUnit: 'kg' })}
                                  className={`px-2 py-0.5 rounded-md transition-all ${
                                    formData.weightUnit === 'kg' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                                  }`}
                                >
                                  kg
                                </button>
                              </div>
                            </div>
                            <input
                              type="number"
                              step="0.1"
                              placeholder={`0.0 ${formData.weightUnit}`}
                              value={formData.weight || ''}
                              onChange={(e) => setFormData({ ...formData, weight: e.target.value })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm font-mono"
                            />
                          </div>

                          {/* Dimensions with Unit Toggle */}
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                                <Maximize2 className="w-3 h-3 text-slate-400" /> Dimensions
                              </label>
                              <div className="flex bg-slate-200/80 p-0.5 rounded-lg text-[10px] font-bold">
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, dimensionUnit: 'in' })}
                                  className={`px-2 py-0.5 rounded-md transition-all ${
                                    formData.dimensionUnit === 'in' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                                  }`}
                                >
                                  in
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setFormData({ ...formData, dimensionUnit: 'cm' })}
                                  className={`px-2 py-0.5 rounded-md transition-all ${
                                    formData.dimensionUnit === 'cm' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
                                  }`}
                                >
                                  cm
                                </button>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-1">
                              <input
                                type="number"
                                placeholder={`L (${formData.dimensionUnit})`}
                                value={formData.length || ''}
                                onChange={(e) => setFormData({ ...formData, length: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-1 py-3 text-center outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs font-mono"
                              />
                              <input
                                type="number"
                                placeholder={`W (${formData.dimensionUnit})`}
                                value={formData.width || ''}
                                onChange={(e) => setFormData({ ...formData, width: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-1 py-3 text-center outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs font-mono"
                              />
                              <input
                                type="number"
                                placeholder={`H (${formData.dimensionUnit})`}
                                value={formData.height || ''}
                                onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl px-1 py-3 text-center outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Declared Value & Service Fee */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200/60">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-fedex-orange" /> Declared Value / Insurance ({formData.currency})
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">
                                {currencySymbol}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formData.declaredValue || ''}
                                onChange={(e) => setFormData({ ...formData, declaredValue: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-7 pr-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-bold text-xs font-mono"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-fedex-purple" /> Service Fee ({formData.currency})
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs pointer-events-none">
                                {currencySymbol}
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={formData.serviceFee || ''}
                                onChange={(e) => setFormData({ ...formData, serviceFee: e.target.value })}
                                className="w-full bg-white border border-slate-200 rounded-xl py-2.5 pl-7 pr-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-bold text-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 6. Special Handling & Delivery Options */}
                  <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/50">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-fedex-purple" />
                      <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Special Handling & Options</h4>
                    </div>

                    {/* Checkboxes Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Dry Ice */}
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-fedex-purple/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.isDryIce}
                          onChange={(e) => setFormData({ ...formData, isDryIce: e.target.checked })}
                          className="w-4 h-4 rounded text-fedex-orange focus:ring-fedex-orange border-slate-300"
                        />
                        <div className="flex items-center gap-2">
                          <Snowflake className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-800">Dry Ice Indicator</span>
                        </div>
                      </label>

                      {/* Hazardous Materials */}
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-fedex-purple/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.isHazardous}
                          onChange={(e) => setFormData({ ...formData, isHazardous: e.target.checked })}
                          className="w-4 h-4 rounded text-fedex-orange focus:ring-fedex-orange border-slate-300"
                        />
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-800">Dangerous Goods (Hazardous)</span>
                        </div>
                      </label>

                      {/* Saturday Delivery */}
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-fedex-purple/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.isSaturdayDelivery}
                          onChange={(e) => setFormData({ ...formData, isSaturdayDelivery: e.target.checked })}
                          className="w-4 h-4 rounded text-fedex-orange focus:ring-fedex-orange border-slate-300"
                        />
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800">Saturday Delivery</span>
                        </div>
                      </label>

                      {/* Hold at Location */}
                      <label className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-xl cursor-pointer hover:border-fedex-purple/40 transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.isHoldAtLocation}
                          onChange={(e) => setFormData({ ...formData, isHoldAtLocation: e.target.checked })}
                          className="w-4 h-4 rounded text-fedex-orange focus:ring-fedex-orange border-slate-300"
                        />
                        <div className="flex items-center gap-2">
                          <Building className="w-3.5 h-3.5 text-fedex-purple shrink-0" />
                          <span className="text-xs font-bold text-slate-800">Hold at FedEx Location</span>
                        </div>
                      </label>
                    </div>

                    {/* Signature Required Options */}
                    <div className="space-y-2 pt-2 border-t border-slate-200/60">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        <FileSignature className="w-3.5 h-3.5 text-fedex-purple" /> Signature Confirmation
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {SIGNATURE_OPTIONS.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setFormData({ ...formData, signatureOption: opt })}
                            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
                              formData.signatureOption === opt
                                ? 'bg-fedex-purple text-white border-fedex-purple shadow-sm'
                                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 7. Time and Estimated Delivery */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Time of Entry */}
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                        <Clock className="w-3 h-3" /> Time of Entry
                      </label>
                      <input
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
                        type="date"
                        value={formData.estimatedDeliveryDate}
                        onChange={(e) => setFormData({ ...formData, estimatedDeliveryDate: e.target.value })}
                        className="w-full border-b-2 border-slate-100 py-4 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-medium text-base md:text-lg lg:text-base"
                        style={{ fontSize: '16px' }}
                      />
                    </div>
                  </div>

                  {/* 8. Master Automation & Override Toggles */}
                  <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Sliders className="w-3.5 h-3.5 text-fedex-purple" />
                        <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-[0.2em]">Master Controls & Automation</h4>
                      </div>
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Schema Bound</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Auto-Advance Timeline Toggle */}
                      <div className="bg-white border border-slate-200 p-4 rounded-xl flex flex-col justify-between space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Clock className="w-4 h-4 text-fedex-purple shrink-0" />
                              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Auto-Advance Timeline</span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Progresses tracking node through the 8 scheduled FedEx milestones as timestamps elapse.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, autoAdvance: !formData.autoAdvance })}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              formData.autoAdvance ? 'bg-fedex-purple' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                formData.autoAdvance ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                            formData.autoAdvance ? 'bg-purple-100 text-fedex-purple' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {formData.autoAdvance ? 'ACTIVE: Automated Progress' : 'MANUAL: Clock Static'}
                          </span>
                        </div>
                      </div>

                      {/* ON HOLD Master Override Toggle */}
                      <div className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 ${
                        formData.isOnHold 
                          ? 'bg-amber-500/10 border-fedex-orange text-slate-900 shadow-md shadow-fedex-orange/10' 
                          : 'bg-white border-slate-200'
                      }`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Pause className={`w-4 h-4 shrink-0 ${formData.isOnHold ? 'text-fedex-orange' : 'text-slate-400'}`} />
                              <span className={`text-xs font-black uppercase tracking-wider ${formData.isOnHold ? 'text-fedex-orange' : 'text-slate-800'}`}>
                                ON HOLD Master Override
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 leading-relaxed">
                              Freezes transit progress at the active step and displays dynamic Hold badge on tracking portal.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, isOnHold: !formData.isOnHold })}
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                              formData.isOnHold ? 'bg-fedex-orange' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                formData.isOnHold ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          {formData.isOnHold ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-fedex-orange text-white flex items-center gap-1.5 animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-white" />
                              HOLD ACTIVE — PROGRESS FROZEN
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500">
                              Transit Operational
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 9. Automated Route & 8-Stage Milestone Generator */}
                  <div className="space-y-4 border border-slate-100 p-5 rounded-2xl bg-slate-50/50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <Route className="w-4 h-4 text-fedex-orange" />
                          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em]">
                            FedEx 8-Stage Logistics & Route Engine
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500">
                          AI-powered FedEx transit calculation based on origin, destination, service tier, and global hubs.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleGenerateRoute}
                          disabled={isCalculatingRoute}
                          className="flex items-center gap-2 bg-fedex-purple hover:bg-purple-700 disabled:opacity-60 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
                        >
                          <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isCalculatingRoute ? 'animate-spin' : ''}`} />
                          {isCalculatingRoute
                            ? 'Calculating FedEx Route...'
                            : isRouteGenerated
                            ? 'AI Recalculate Route'
                            : 'AI Calculate FedEx Route'}
                        </button>
                        {isRouteGenerated && (
                          <button
                            type="button"
                            onClick={() => setShowMilestonesEditor(!showMilestonesEditor)}
                            className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors"
                            title="Toggle Milestone Inspector"
                          >
                            {showMilestonesEditor ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* AI Routing Context Banner */}
                    {isRouteGenerated && (aiHubName || aiRoutingSummary) && (
                      <div className="bg-purple-50/80 border border-fedex-purple/20 rounded-xl p-3 flex items-start gap-2.5">
                        <Sparkles className="w-4 h-4 text-fedex-purple shrink-0 mt-0.5" />
                        <div className="space-y-0.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-fedex-purple uppercase text-[10px] tracking-wider">
                              {isAiGenerated ? 'Gemini FedEx AI Hub' : 'FedEx Global Hub Routing'}
                            </span>
                            {aiHubName && (
                              <span className="px-2 py-0.5 rounded bg-white border border-fedex-purple/30 text-fedex-purple text-[10px] font-bold">
                                {aiHubName}
                              </span>
                            )}
                          </div>
                          {aiRoutingSummary && (
                            <p className="text-slate-600 text-[11px] leading-relaxed">
                              {aiRoutingSummary}
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Milestones Preview / Editor */}
                    {isRouteGenerated && milestones.length > 0 ? (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                          <span>8 Sequential Milestones ({routeWaypoints.length} Waypoints)</span>
                          <span className="text-emerald-600 font-black flex items-center gap-1">
                            <Check className="w-3 h-3" /> Ready for Registry
                          </span>
                        </div>

                        <div className="space-y-2">
                          {milestones.map((item, idx) => {
                            const isEditing = editingMilestoneIdx === idx;
                            return (
                              <div
                                key={idx}
                                className="bg-white border border-slate-200 rounded-xl p-3 text-xs transition-all hover:border-fedex-purple/30"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className="w-5 h-5 rounded-full bg-fedex-purple/10 text-fedex-purple font-black text-[10px] flex items-center justify-center shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      <p className="font-black text-slate-800 text-xs truncate">
                                        {item.status_name}
                                      </p>
                                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1">
                                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                        {item.location || 'Facility Hub'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <span className="text-[10px] font-mono text-slate-400 hidden sm:inline-block">
                                      {new Date(item.timestamp).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setEditingMilestoneIdx(isEditing ? null : idx)}
                                      className="p-1.5 text-slate-400 hover:text-fedex-purple hover:bg-slate-50 rounded-lg transition-colors"
                                      title="Edit milestone parameters"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Inline Milestone Editor */}
                                {isEditing && (
                                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50/70 p-3 rounded-lg">
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                        Status Text
                                      </label>
                                      <input
                                        type="text"
                                        value={item.status_name}
                                        onChange={(e) => handleMilestoneChange(idx, 'status_name', e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-fedex-orange"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                        Facility / Location
                                      </label>
                                      <input
                                        type="text"
                                        value={item.location}
                                        onChange={(e) => handleMilestoneChange(idx, 'location', e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-fedex-orange"
                                      />
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                        Scheduled Timestamp (ISO / UTC)
                                      </label>
                                      <input
                                        type="text"
                                        value={item.timestamp}
                                        onChange={(e) => handleMilestoneChange(idx, 'timestamp', e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 outline-none focus:border-fedex-orange"
                                      />
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                        Milestone Description
                                      </label>
                                      <input
                                        type="text"
                                        value={item.description}
                                        onChange={(e) => handleMilestoneChange(idx, 'description', e.target.value)}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-fedex-orange"
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="bg-white border border-dashed border-slate-200 rounded-xl p-4 text-center space-y-2">
                        <Route className="w-6 h-6 text-slate-300 mx-auto" />
                        <p className="text-xs text-slate-500 font-medium">
                          The 8-stage FedEx transit route will automatically calculate upon shipment creation.
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Or click <strong className="text-fedex-purple">"Generate 8-Stage Route"</strong> above to preview and manually edit milestones now.
                        </p>
                      </div>
                    )}
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
