/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
  FileText,
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
  Sparkles,
  Barcode
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, ShipmentHistoryItem, RouteWaypoint, UserProfile } from '../types';
import { supabase } from '../lib/supabase';
import { CURRENCY_OPTIONS, CurrencyOption, getCurrencySymbol } from '../constants/currencies';
import { 
  generate8StageRoute, 
  calculateFedExRouteWithAI, 
  calculate8StageSpacedTimestamps,
  deduplicateAndEnforce8Stages,
  recalculateUnfilledMilestones,
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
  key?: React.Key;
  isOpen: boolean;
  onClose: () => void;
  onShipmentCreated: () => void;
  onOptimisticCreate: (shipment: Shipment) => void;
  userId: string;
  profile?: UserProfile | null;
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
  'Box',
  'FedEx Box (Small/Medium/Large)',
  'FedEx Envelope',
  'FedEx Pak',
  'FedEx Tube',
  'Your Packaging (custom box)',
  'Pallet / Freight',
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
    // Strip commas, spaces, currency symbols
    const cleaned = trimmed.replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
};

export const formatAmountString = (val: string | number): string => {
  if (!val && val !== 0) return '';
  const str = String(val).trim();
  if (!str) return '';
  const num = parseAmount(str);
  if (isNaN(num)) return str;
  if (str.includes('.')) {
    const parts = str.replace(/,/g, '').split('.');
    const intPart = parseAmount(parts[0]).toLocaleString('en-US');
    const decPart = parts[1] || '';
    return `${intPart}.${decPart}`;
  }
  return num.toLocaleString('en-US');
};

export const parseCount = (val: any, fallback = 0): number => {
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

// Generates an authentic fresh 12-digit FedEx tracking ID (non-zero leading digit)
export const generateTrackingId = (): string => {
  return Math.floor(100000000000 + Math.random() * 900000000000).toString();
};

export const formatTrackingId = (id: string): string => {
  if (!id) return '';
  return id.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
};

export const getInitialFormData = () => ({
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
  packageType: 'Box',
  packageName: '',
  weight: '',
  weightUnit: 'lbs' as 'lbs' | 'kg',
  length: '',
  width: '',
  height: '',
  dimensionUnit: 'in' as 'in' | 'cm',
  numPackages: '0',
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
});

export default function TheForge({ isOpen, onClose, onShipmentCreated, onOptimisticCreate, userId, profile }: TheForgeProps) {
  const [formData, setFormData] = useState(getInitialFormData);
  const [trackingId, setTrackingId] = useState<string>(generateTrackingId);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
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

  // Central State Flushing Function: explicitly resets EVERY single state variable to factory defaults
  const resetAllShipmentFormState = useCallback((clearSuccess = true) => {
    // 1. Reset all form inputs to factory defaults (with profile prefill if available)
    const initial = getInitialFormData();
    if (profile) {
      if (profile.name) initial.senderName = profile.name;
      if (profile.address) initial.senderAddress = profile.address;
    }
    setFormData(initial);

    // 2. Reset timeline history, route waypoints, and AI logistics routing state
    setMilestones([]);
    setRouteWaypoints([]);
    setIsRouteGenerated(false);
    setShowMilestonesEditor(false);
    setEditingMilestoneIdx(null);
    setIsCalculatingRoute(false);
    setAiHubName(null);
    setAiRoutingSummary(null);
    setIsAiGenerated(false);

    // 3. Reset error and UI feedback states
    setError(null);
    setSaveStatus('idle');
    setCopied(false);

    // 4. Auto-generate a brand-new, unique 12-digit tracking ID
    const freshId = generateTrackingId();
    setTrackingId(freshId);

    // 5. Clear success overlay if requested
    if (clearSuccess) {
      setSuccessData(null);
    }

    // 6. Hard-flush any persisted form cache, AI route buffers, or temp waypoint state
    try {
      localStorage.removeItem('forge_form_cache');
      localStorage.removeItem('forge_route_cache');
      sessionStorage.removeItem('forge_form_cache');
      sessionStorage.removeItem('forge_route_cache');
    } catch {
      // ignore
    }
  }, []);

  // Trigger Hook 1: Modal Open Trigger - Execute resetAllShipmentFormState() immediately when modal opens
  useEffect(() => {
    if (isOpen) {
      resetAllShipmentFormState(true);
    }
  }, [isOpen, resetAllShipmentFormState]);

  // Trigger Hook 2: Form Unmount Trigger - Clean up memory and prevent stale state retention on unmount
  useEffect(() => {
    return () => {
      resetAllShipmentFormState(true);
    };
  }, [resetAllShipmentFormState]);

  const handleGenerateRoute = async () => {
    setIsCalculatingRoute(true);
    try {
      const cleanOriginAddress = (formData.senderAddress && formData.senderAddress.trim())
        || (formData.originCityState && formData.originCityState.trim() && formData.originCityState.trim().toLowerCase() !== (formData.senderName || '').trim().toLowerCase() ? formData.originCityState.trim() : '')
        || 'FedEx Origin Facility';

      const plan = await calculateFedExRouteWithAI({
        origin: cleanOriginAddress,
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

  const handleRecalculateUnfilled = () => {
    const cleanOriginAddress = (formData.senderAddress && formData.senderAddress.trim())
      || (formData.originCityState && formData.originCityState.trim() && formData.originCityState.trim().toLowerCase() !== (formData.senderName || '').trim().toLowerCase() ? formData.originCityState.trim() : '')
      || 'FedEx Origin Facility';

    const calculated = recalculateUnfilledMilestones(milestones, {
      origin: cleanOriginAddress,
      senderAddress: formData.senderAddress,
      destination: formData.destinationAddress,
      senderName: formData.senderName,
      recipientName: formData.recipientName,
      serviceType: formData.serviceType,
      startTime: formData.timeOfEntry,
      estimatedDeliveryDate: formData.estimatedDeliveryDate
    });

    const waypoints: RouteWaypoint[] = calculated.map((item, idx) => ({
      stage: idx + 1,
      stage_name: item.status_name,
      location: item.location,
      estimated_time: item.timestamp,
      description: item.description
    }));

    setMilestones(calculated);
    setRouteWaypoints(waypoints);
    setIsRouteGenerated(true);
    setShowMilestonesEditor(true);
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

  const selectedCurrency = CURRENCY_OPTIONS.find(c => c.code === formData.currency) || CURRENCY_OPTIONS[0];
  const currencySymbol = selectedCurrency.symbol;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsInitializing(true);
    setSaveStatus('saving');
    setError(null);
    
    // 1. Core Identifiers & Required Fields:
    // Use the freshly auto-generated 12-digit tracking ID
    const activeTrackingId = trackingId || generateTrackingId();
    const eventTime = formData.timeOfEntry ? new Date(formData.timeOfEntry).toISOString() : new Date().toISOString();
    
    // 2. Sender Details:
    const senderName = formData.senderName && formData.senderName.trim() ? formData.senderName.trim() : null;
    const senderAddress = formData.senderAddress && formData.senderAddress.trim() ? formData.senderAddress.trim() : null;
    const originCityState = (senderAddress && senderAddress.trim())
      || (formData.originCityState && formData.originCityState.trim() && formData.originCityState.trim().toLowerCase() !== (senderName || '').trim().toLowerCase() ? formData.originCityState.trim() : '')
      || 'FedEx Origin Facility';

    const recipientName = formData.recipientName && formData.recipientName.trim() ? formData.recipientName.trim() : 'Unspecified';
    const destinationAddress = formData.destinationAddress && formData.destinationAddress.trim() ? formData.destinationAddress.trim() : null;

    // 3. Financial & Service Settings:
    const currency = formData.currency && formData.currency.trim() ? formData.currency.trim() : 'USD';
    const serviceType = formData.serviceType && formData.serviceType.trim() ? formData.serviceType.trim() : 'FedEx Priority Overnight';
    const assetValue = parseAmount(formData.assetValue, 0);
    const serviceFee = parseAmount(formData.serviceFee, 0);
    const declaredValue = assetValue; // Synchronized with asset value
    const estimatedDeliveryDate = formData.estimatedDeliveryDate && formData.estimatedDeliveryDate.trim()
      ? formData.estimatedDeliveryDate.trim().slice(0, 10)
      : null;

    // 4. Package Specifications:
    const packageType = formData.packageType && formData.packageType.trim() ? formData.packageType.trim() : 'Box';
    const packageName = formData.packageName && formData.packageName.trim() ? formData.packageName.trim() : null;
    const weight = parseAmount(formData.weight, 0);
    const weightUnit = formData.weightUnit && formData.weightUnit.trim() ? formData.weightUnit.trim() : 'lbs';
    const length = parseAmount(formData.length, 0);
    const width = parseAmount(formData.width, 0);
    const height = parseAmount(formData.height, 0);
    const dimensionUnit = formData.dimensionUnit && formData.dimensionUnit.trim() ? formData.dimensionUnit.trim() : 'in';
    const numPackages = parseCount(formData.numPackages, 0);

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
      try {
        const plan = await calculateFedExRouteWithAI({
          origin: originCityState,
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
      } catch (calcErr) {
        console.warn('Fallback routing calculation triggered:', calcErr);
      }
    }

    // Strictly enforce Fixed 8-Stage Single Array & Clean Location Mapping Rules before saving to Supabase:
    const nowIso = new Date().toISOString();
    finalHistory = deduplicateAndEnforce8Stages(finalHistory, {
      origin: originCityState,
      senderAddress: senderAddress || undefined,
      destination: destinationAddress,
      senderName: senderName || undefined,
      recipientName: recipientName,
      serviceType: serviceType,
      startTime: eventTime || nowIso,
      estimatedDeliveryDate: estimatedDeliveryDate || undefined
    });

    finalWaypoints = finalHistory.map((item, idx) => ({
      stage: idx + 1,
      stage_name: item.status_name,
      location: item.location,
      estimated_time: item.timestamp,
      description: item.description
    }));

    const isOnHold = Boolean(formData.isOnHold);
    const autoAdvance = Boolean(formData.autoAdvance);

    const dbPayload: Record<string, any> = {
      id: activeTrackingId,
      user_id: userId,
      recipient_name: recipientName,
      destination_address: destinationAddress,
      origin_city_state: originCityState,
      asset_value: assetValue,
      service_fee: serviceFee,
      status: (finalHistory[0]?.status_name || 'Shipping label created') as ShipmentStatus,
      history: finalHistory,
      estimated_delivery_date: estimatedDeliveryDate,
      created_at: nowIso,
      package_type: packageType,
      package_name: packageName,
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
    } as Shipment;

    // Save directly to Supabase with resilient dynamic column pruning & session confirmation
    try {
      if (profile && profile.is_approved === false) {
        throw new Error("Shipment Authorization Denied: Your account is pending administrator approval. You cannot create shipments at this time.");
      }

      // Check session if possible, but do not block if userId is already established
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session && !userId) {
          const { data: { user: recoveredUser }, error: recoveryError } = await supabase.auth.getUser();
          if (recoveryError || !recoveredUser) {
            throw new Error("Authentication session missing. Please sign in to initialize shipments.");
          }
        }
      } catch (authErr) {
        console.warn('Non-blocking auth session check notice:', authErr);
      }

      let payloadToInsert: Record<string, any> = { ...dbPayload };
      let insertSuccess = false;
      let lastInsertError: any = null;

      // Resilient insert loop: strips any columns rejected by PostgREST schema cache
      for (let attempt = 0; attempt < 12; attempt++) {
        const { error: insertError } = await supabase.from('shipments').insert([payloadToInsert]);
        if (!insertError) {
          insertSuccess = true;
          lastInsertError = null;
          break;
        }

        lastInsertError = insertError;
        console.warn(`Supabase insert attempt ${attempt + 1} rejected:`, insertError.message);

        // Detect missing column from error message or details
        const colMatch = insertError.message?.match(/Could not find the ['"]([^'"]+)['"] column/i)
          || insertError.details?.match(/column ['"]([^'"]+)['"] of relation/i)
          || insertError.message?.match(/column ['"]([^'"]+)['"] does not exist/i)
          || insertError.message?.match(/column ['"]([^'"]+)['"] of relation/i);

        if (colMatch && colMatch[1]) {
          const badCol = colMatch[1];
          delete payloadToInsert[badCol];
          continue;
        }

        // If error mentions unknown column or PGRST204/42703 without specific regex capture:
        if (insertError.message?.includes('column') || insertError.code === 'PGRST204' || insertError.code === '42703') {
          const candidateKeysToPrune = [
            'package_name', 'route_waypoints', 'is_on_hold', 'auto_advance', 'sender_address',
            'sender_name', 'currency', 'service_type', 'declared_value', 'is_dry_ice',
            'is_hazardous', 'is_saturday_delivery', 'signature_option', 'is_hold_at_location',
            'weight_unit', 'dimension_unit', 'package_type', 'weight', 'length', 'width', 'height', 'num_packages'
          ];
          const keyToRemove = candidateKeysToPrune.find(k => k in payloadToInsert);
          if (keyToRemove) {
            delete payloadToInsert[keyToRemove];
            continue;
          }
        }

        break;
      }

      if (!insertSuccess && lastInsertError) {
        throw lastInsertError;
      }

      // Success confirmation: Mark saved and reveal confirmation overlay
      setSaveStatus('saved');
      setSuccessData({ trackingId: activeTrackingId });
      onOptimisticCreate(newShipment);
      onShipmentCreated();

      // Trigger Hook 3: Post-Submission Trigger
      // Execute resetAllShipmentFormState() immediately upon a successful Supabase insert before closing the modal
      // Note: Passing false keeps successData visible for the user to view/copy the freshly saved ID
      resetAllShipmentFormState(false);
    } catch (err: any) {
      console.error('Shipment save error:', err);
      setSaveStatus('failed');
      setError(err?.message || 'Unable to save shipment at this time. Please check your connection and try again.');
    } finally {
      setIsInitializing(false);
    }
  };

  const handleCopy = () => {
    if (successData) {
      navigator.clipboard.writeText(formatTrackingId(successData.trackingId));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleResetAndClose = () => {
    resetAllShipmentFormState(true);
    onClose();
  };

  const handleClose = () => {
    resetAllShipmentFormState(true);
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
            onClick={successData ? undefined : handleClose}
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
                  onClick={handleClose}
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

                  {/* Auto-Generated 12-Digit Tracking ID Header */}
                  <div className="bg-gradient-to-r from-purple-50/90 via-slate-50 to-orange-50/50 border border-fedex-purple/20 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-black text-fedex-purple uppercase tracking-[0.2em] flex items-center gap-1.5">
                        <Barcode className="w-3.5 h-3.5" /> Assigned 12-Digit Tracking Identifier
                      </span>
                      <p className="text-xl font-black text-slate-900 font-mono tracking-wider">
                        {formatTrackingId(trackingId)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-full bg-purple-100 text-fedex-purple text-[9px] font-black uppercase tracking-wider">
                        Auto-Generated Fresh
                      </span>
                      <button
                        type="button"
                        onClick={() => setTrackingId(generateTrackingId())}
                        className="px-2.5 py-1 rounded-lg bg-white border border-fedex-purple/30 hover:bg-fedex-purple hover:text-white text-fedex-purple text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer shadow-xs active:scale-95"
                        title="Generate another fresh 12-digit Tracking ID"
                      >
                        <RefreshCw className="w-3 h-3" /> New ID
                      </button>
                    </div>
                  </div>

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
                          onChange={(e) => setFormData({ ...formData, senderName: e.target.value })}
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
                          onChange={(e) => setFormData({ ...formData, senderAddress: e.target.value, originCityState: e.target.value })}
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
                            type="text"
                            inputMode="decimal"
                            value={formData.assetValue}
                            onChange={(e) => setFormData({ ...formData, assetValue: e.target.value })}
                            onBlur={() => {
                              if (formData.assetValue) {
                                setFormData(prev => ({ ...prev, assetValue: formatAmountString(prev.assetValue) }));
                              }
                            }}
                            className="w-full bg-white border border-slate-200 rounded-xl py-3 pl-8 pr-3 focus:border-fedex-orange outline-none transition-colors text-slate-900 font-bold text-sm font-mono"
                            placeholder="e.g. 2,500,000"
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
                            type="text"
                            inputMode="decimal"
                            value={formData.serviceFee}
                            onChange={(e) => setFormData({ ...formData, serviceFee: e.target.value })}
                            onBlur={() => {
                              if (formData.serviceFee) {
                                setFormData(prev => ({ ...prev, serviceFee: formatAmountString(prev.serviceFee) }));
                              }
                            }}
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

                        {/* Package Name / Information */}
                        <div className="pt-2 border-t border-slate-200/60 space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-fedex-purple" /> Package Name / Information
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. Legal Documents, Electronics, Sovereign Asset Vault"
                            value={formData.packageName || ''}
                            onChange={(e) => setFormData({ ...formData, packageName: e.target.value })}
                            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-fedex-orange transition-colors text-slate-900 font-medium text-sm"
                            style={{ fontSize: '16px' }}
                          />
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
                            onClick={handleRecalculateUnfilled}
                            className="flex items-center gap-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
                            title="Preserves all your manual inputs and timing, recalculating only unfilled stages"
                          >
                            <Clock className="w-3.5 h-3.5 text-fedex-purple" />
                            Recalculate Unfilled
                          </button>
                        )}
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
                            const isActiveStage = idx === 0;
                            return (
                              <div
                                key={idx}
                                className={`border rounded-xl p-3 text-xs transition-all ${
                                  isActiveStage 
                                    ? 'bg-purple-50/40 border-fedex-purple/30 ring-1 ring-fedex-purple/10' 
                                    : 'bg-white border-slate-200 hover:border-fedex-purple/30'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span className={`w-5 h-5 rounded-full font-black text-[10px] flex items-center justify-center shrink-0 ${
                                      isActiveStage ? 'bg-fedex-purple text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <p className="font-black text-slate-800 text-xs truncate">
                                          {item.status_name}
                                        </p>
                                        {isActiveStage ? (
                                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-fedex-purple text-white flex items-center gap-1 shadow-sm">
                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                            ACTIVE (NOW)
                                          </span>
                                        ) : (
                                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                                            UPCOMING
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                        {item.location || 'Facility Hub'}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right hidden sm:block">
                                      <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                        {isActiveStage ? 'Current (Now)' : 'Scheduled'}
                                      </p>
                                      <span className="text-[10px] font-mono text-slate-600 font-bold">
                                        {new Date(item.timestamp).toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </span>
                                    </div>
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
                    className="w-full bg-fedex-orange hover:bg-orange-600 text-white font-black py-5 rounded-2xl transition-all active:scale-[0.98] shadow-xl shadow-fedex-orange/20 flex items-center justify-center gap-3 uppercase tracking-widest disabled:opacity-50 text-sm cursor-pointer"
                  >
                    {isInitializing ? (
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 animate-spin" />
                        Saving Shipment Details...
                      </div>
                    ) : (
                      <><Package className="w-5 h-5" /> Initialize & Save Shipment <ArrowRight className="w-5 h-5" /></>
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
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                      <Check className="text-emerald-600 w-10 h-10" />
                    </div>

                    {/* Prominent Save Confirmation Badge */}
                    {saveStatus === 'saved' ? (
                      <div className="inline-flex items-center gap-2 bg-emerald-500 text-white px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest mb-3 shadow-lg shadow-emerald-500/25">
                        <Check className="w-4 h-4" />
                        Shipment saved
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-2 bg-amber-500 text-white px-5 py-2 rounded-full text-xs font-black uppercase tracking-widest mb-3 shadow-lg shadow-amber-500/25">
                        <AlertTriangle className="w-4 h-4" />
                        Shipment status: {saveStatus}
                      </div>
                    )}
                    
                    <h3 className="text-fedex-orange font-black text-2xl uppercase tracking-tight mb-2">
                      Shipment Initialized
                    </h3>
                    <p className="text-slate-500 text-xs md:text-sm mb-8 font-medium">
                      {saveStatus === 'saved'
                        ? 'Shipment created and registered successfully.'
                        : 'Tracking ID generated and logged to shipment registry.'}
                    </p>

                    <div className="bg-slate-50 border border-slate-100 rounded-2xl p-8 w-full mb-8">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] block mb-4">Assigned Tracking Identifier</span>
                      <div className="flex flex-col md:flex-row items-center justify-center gap-4">
                        <span className="text-3xl md:text-4xl font-black text-slate-900 font-mono tracking-tighter">
                          {formatTrackingId(successData.trackingId)}
                        </span>
                        <button
                          onClick={handleCopy}
                          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shrink-0 cursor-pointer ${
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
                      className="w-full border-2 border-slate-900 text-slate-900 hover:bg-slate-900 hover:text-white font-black py-4 rounded-2xl transition-all uppercase tracking-widest text-xs md:text-sm cursor-pointer"
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
