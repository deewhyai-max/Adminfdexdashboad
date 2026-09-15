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
  Snowflake,
  Route,
  Play,
  Pause,
  Sliders,
  Sparkles,
  Edit3,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Shipment, ShipmentStatus, ShipmentHistoryItem, RouteWaypoint } from '../types';
import { supabase } from '../lib/supabase';
import { 
  generate8StageRoute, 
  calculateFedExRouteWithAI, 
  calculate8StageSpacedTimestamps,
  evaluateShipmentMilestones,
  deduplicateAndEnforce8Stages,
  advanceShipmentToStage,
  CANONICAL_STAGE_ORDER,
  FEDEX_8_STAGES 
} from '../utils/routeGenerator';
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
  'Arriving at destination facility',
  'At local FedEx facility',
  'Out for Delivery',
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

  // Automation & 8-Stage Milestone Route State
  const [autoAdvance, setAutoAdvance] = useState(shipment?.auto_advance !== false);
  const [isOnHold, setIsOnHold] = useState(Boolean(shipment?.is_on_hold));
  const [milestones, setMilestones] = useState<ShipmentHistoryItem[]>(() => {
    return deduplicateAndEnforce8Stages(shipment?.history, {
      origin: shipment?.origin_city_state || undefined,
      senderAddress: shipment?.sender_address || undefined,
      destination: shipment?.destination_address || undefined,
      senderName: shipment?.sender_name || undefined,
      recipientName: shipment?.recipient_name || undefined,
      serviceType: shipment?.service_type || undefined,
      estimatedDeliveryDate: shipment?.estimated_delivery_date || undefined
    });
  });
  const [routeWaypoints, setRouteWaypoints] = useState<RouteWaypoint[]>(shipment?.route_waypoints || []);
  const [editingMilestoneIdx, setEditingMilestoneIdx] = useState<number | null>(null);
  const [showMilestoneEngine, setShowMilestoneEngine] = useState(false);
  const [isSavingMilestones, setIsSavingMilestones] = useState(false);
  const [milestonesSuccess, setMilestonesSuccess] = useState(false);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [aiHubName, setAiHubName] = useState<string | null>(null);
  const [aiRoutingSummary, setAiRoutingSummary] = useState<string | null>(null);
  const [isAiGenerated, setIsAiGenerated] = useState(false);

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
      setAutoAdvance(shipment.auto_advance !== false);
      setIsOnHold(Boolean(shipment.is_on_hold));

      const cleanHistory = deduplicateAndEnforce8Stages(shipment.history, {
        origin: shipment.origin_city_state || undefined,
        senderAddress: shipment.sender_address || undefined,
        destination: shipment.destination_address || undefined,
        senderName: shipment.sender_name || undefined,
        recipientName: shipment.recipient_name || undefined,
        serviceType: shipment.service_type || undefined,
        estimatedDeliveryDate: shipment.estimated_delivery_date || undefined
      });
      setMilestones(cleanHistory);
      setRouteWaypoints(cleanHistory.map((item, idx) => ({
        stage: idx + 1,
        stage_name: item.status_name,
        location: item.location,
        estimated_time: item.timestamp,
        description: item.description
      })));

      // Initialize location & description fields with the current active milestone's values
      const currentActiveStage = cleanHistory.find(m => m.status_name === shipment.status) || cleanHistory[0];
      if (currentActiveStage) {
        setLocation(currentActiveStage.location || '');
        if (currentActiveStage.description) {
          setDescription(currentActiveStage.description);
        }
      }
    }
  }, [shipment]);

  // Active vs Upcoming Evaluation Logic:
  // Dynamically determines active, completed, and upcoming stages according to live clock time
  const currentHistoryToEvaluate = milestones.length > 0 ? milestones : (shipment?.history || []);
  const milestoneEval = evaluateShipmentMilestones(
    currentHistoryToEvaluate,
    autoAdvance,
    isOnHold,
    shipment?.status
  );

  const handleToggleHold = async () => {
    const nextHold = !isOnHold;
    setIsOnHold(nextHold);
    try {
      const { error: hErr } = await supabase
        .from('shipments')
        .update({ is_on_hold: nextHold })
        .eq('id', shipment.id)
        .eq('user_id', userId);
      if (!hErr) {
        onUpdate({
          ...shipment,
          is_on_hold: nextHold
        });
      }
    } catch (err) {
      console.error("Hold toggle update error:", err);
    }
  };

  const handleToggleAutoAdvance = async () => {
    const nextAdvance = !autoAdvance;
    setAutoAdvance(nextAdvance);
    try {
      const { error: aErr } = await supabase
        .from('shipments')
        .update({ auto_advance: nextAdvance })
        .eq('id', shipment.id)
        .eq('user_id', userId);
      if (!aErr) {
        onUpdate({
          ...shipment,
          auto_advance: nextAdvance
        });
      }
    } catch (err) {
      console.error("Auto-advance toggle update error:", err);
    }
  };

  const handleGenerate8StageRoute = async () => {
    setIsCalculatingRoute(true);
    try {
      const plan = await calculateFedExRouteWithAI({
        origin: origin || senderAddress || senderName || 'Origin Facility',
        senderAddress: senderAddress || undefined,
        destination: address || 'Destination Address',
        recipientName: recipient || shipment.recipient_name,
        senderName: senderName || shipment.sender_name || undefined,
        serviceType: serviceType || shipment.service_type || undefined,
        packageType: packageType || shipment.package_type || undefined,
        weight: parseAmount(weight, 0),
        weightUnit: weightUnit || shipment.weight_unit || 'lbs',
        startTime: entryTime || shipment.created_at,
        estimatedDeliveryDate: deliveryDate || shipment.estimated_delivery_date || undefined,
        isDryIce: isDryIce,
        isHazardous: isHazardous,
        isSaturdayDelivery: isSaturdayDelivery
      });
      setMilestones(plan.history);
      setRouteWaypoints(plan.route_waypoints);
      setAiHubName(plan.hub_name || null);
      setAiRoutingSummary(plan.routing_summary || null);
      setIsAiGenerated(Boolean(plan.ai_generated));
      setShowMilestoneEngine(true);
    } catch (err) {
      console.error("AI route calculation error in ManageShipment:", err);
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

  const handleRespaceTimestamps = () => {
    if (!milestones || milestones.length !== 8) return;
    const freshTimestamps = calculate8StageSpacedTimestamps(
      new Date(),
      deliveryDate || shipment?.estimated_delivery_date || undefined
    );
    setMilestones(prev => prev.map((m, idx) => ({
      ...m,
      timestamp: freshTimestamps[idx]
    })));
    setRouteWaypoints(prev => prev.map((w, idx) => ({
      ...w,
      estimated_time: freshTimestamps[idx]
    })));
  };

  const handleSaveMilestones = async () => {
    setIsSavingMilestones(true);
    setMilestonesSuccess(false);
    try {
      const cleanedMilestones = deduplicateAndEnforce8Stages(milestones, {
        origin: origin || undefined,
        senderAddress: senderAddress || shipment?.sender_address || undefined,
        destination: address || shipment?.destination_address || undefined,
        senderName: senderName || shipment?.sender_name || undefined,
        recipientName: recipient || shipment?.recipient_name || undefined,
        serviceType: serviceType || shipment?.service_type || undefined,
        estimatedDeliveryDate: deliveryDate || shipment?.estimated_delivery_date || undefined
      });

      const cleanedWaypoints: RouteWaypoint[] = cleanedMilestones.map((item, idx) => ({
        stage: idx + 1,
        stage_name: item.status_name,
        location: item.location,
        estimated_time: item.timestamp,
        description: item.description
      }));

      const payload: any = {
        history: cleanedMilestones,
        route_waypoints: cleanedWaypoints,
        auto_advance: autoAdvance,
        is_on_hold: isOnHold
      };

      let { error: mError } = await supabase
        .from('shipments')
        .update(payload)
        .eq('id', shipment.id)
        .eq('user_id', userId);

      if (mError && (mError.message?.includes('is_on_hold') || mError.message?.includes('route_waypoints') || mError.message?.includes('auto_advance'))) {
        delete payload.is_on_hold;
        delete payload.route_waypoints;
        delete payload.auto_advance;
        const res = await supabase.from('shipments').update(payload).eq('id', shipment.id).eq('user_id', userId);
        mError = res.error;
      }

      if (mError) throw mError;

      setMilestones(cleanedMilestones);
      setRouteWaypoints(cleanedWaypoints);

      onUpdate({
        ...shipment,
        history: cleanedMilestones,
        route_waypoints: cleanedWaypoints,
        auto_advance: autoAdvance,
        is_on_hold: isOnHold
      });
      setMilestonesSuccess(true);
      setTimeout(() => setMilestonesSuccess(false), 2500);
    } catch (err) {
      console.error('Milestone save failure:', err);
    } finally {
      setIsSavingMilestones(false);
    }
  };

  const handleDirectStageAdvance = async (stageStatus: ShipmentStatus) => {
    setIsSavingMilestones(true);
    setMilestonesSuccess(false);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        const { data: { user: recoveredUser }, error: recoveryError } = await supabase.auth.getUser();
        if (recoveryError || !recoveredUser) throw new Error('Administrative link broken. Re-login required.');
      }

      const effectiveHistory = milestones.length === 8 ? milestones : (shipment.history || []);
      const nowIso = new Date().toISOString();
      const { history: updatedHistory, route_waypoints: updatedWaypoints } = advanceShipmentToStage(
        effectiveHistory,
        stageStatus,
        {
          manualTimestamp: nowIso,
          estimatedDeliveryDate: deliveryDate || shipment.estimated_delivery_date || undefined,
          origin: origin || undefined,
          senderAddress: senderAddress || shipment.sender_address || undefined,
          destination: address || shipment.destination_address || undefined,
          senderName: senderName || shipment.sender_name || undefined,
          recipientName: recipient || shipment.recipient_name || undefined,
          serviceType: serviceType || shipment.service_type || undefined
        }
      );

      const isHold = stageStatus === 'On Hold';
      const payload: any = {
        status: stageStatus,
        history: updatedHistory,
        route_waypoints: updatedWaypoints,
        is_on_hold: isHold
      };

      let { error: updateError } = await supabase
        .from('shipments')
        .update(payload)
        .eq('id', shipment.id)
        .eq('user_id', userId);

      if (updateError && (updateError.message?.includes('is_on_hold') || updateError.message?.includes('route_waypoints'))) {
        delete payload.is_on_hold;
        delete payload.route_waypoints;
        const res = await supabase.from('shipments').update(payload).eq('id', shipment.id).eq('user_id', userId);
        updateError = res.error;
      }

      if (updateError) throw updateError;

      setNewStatus(stageStatus);
      setMilestones(updatedHistory);
      setRouteWaypoints(updatedWaypoints);
      setIsOnHold(isHold);

      onUpdate({
        ...shipment,
        status: stageStatus,
        is_on_hold: isHold,
        history: updatedHistory,
        route_waypoints: updatedWaypoints
      });

      setMilestonesSuccess(true);
      setTimeout(() => setMilestonesSuccess(false), 2500);
    } catch (err) {
      console.error('Direct stage advance error:', err);
    } finally {
      setIsSavingMilestones(false);
    }
  };

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

      // Strictly prioritize senderAddress over senderName, never use senderName as origin
      const cleanOriginCityState = (senderAddress && senderAddress.trim())
        || (origin && origin.trim() && origin.trim().toLowerCase() !== (senderName || '').trim().toLowerCase() ? origin.trim() : '')
        || 'FedEx Origin Facility';

      const updatedData: any = {
        recipient_name: recipient && recipient.trim() ? recipient.trim() : 'Unspecified',
        destination_address: address && address.trim() ? address.trim() : null,
        origin_city_state: cleanOriginCityState,
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
        is_hold_at_location: Boolean(isHoldAtLocation),
        is_on_hold: Boolean(isOnHold),
        auto_advance: Boolean(autoAdvance),
        route_waypoints: routeWaypoints,
        history: milestones.length > 0 ? milestones : shipment.history
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

    try {
      // --- SESSION CHECK-FIRST PROTOCOL ---
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.warn("Update Protocol: Session missing. Restoring token hierarchy...");
        const { data: { user: recoveredUser }, error: recoveryError } = await supabase.auth.getUser();
        if (recoveryError || !recoveredUser) throw new Error('Administrative link broken. Re-login required.');
      }
      // ------------------------------------

      // Strict Fixed 8-Stage Single Array Rule:
      // When a manual update is done, save the location and timing set by the user,
      // and still leave the ones AI calculated as upcoming.
      // Don't use sender name as location for stages, use sender address only.
      const effectiveHistory = milestones.length === 8 ? milestones : (shipment.history || []);
      const manualTs = updateTime ? new Date(updateTime).toISOString() : new Date().toISOString();

      const { history: updatedHistory, route_waypoints: updatedWaypoints } = advanceShipmentToStage(
        effectiveHistory,
        newStatus,
        {
          manualTimestamp: manualTs,
          estimatedDeliveryDate: deliveryDate || shipment.estimated_delivery_date || undefined,
          location: location || undefined,
          description: description || undefined,
          origin: origin || undefined,
          senderAddress: senderAddress || shipment.sender_address || undefined,
          destination: address || shipment.destination_address || undefined,
          senderName: senderName || shipment.sender_name || undefined,
          recipientName: recipient || shipment.recipient_name || undefined,
          serviceType: serviceType || shipment.service_type || undefined
        }
      );

      const isHold = newStatus === 'On Hold';
      const payload: any = {
        status: newStatus,
        history: updatedHistory,
        route_waypoints: updatedWaypoints,
        is_on_hold: isHold
      };

      let { error: updateError } = await supabase
        .from('shipments')
        .update(payload)
        .eq('id', shipment.id)
        .eq('user_id', userId);

      if (updateError && (updateError.message?.includes('is_on_hold') || updateError.message?.includes('route_waypoints'))) {
        delete payload.is_on_hold;
        delete payload.route_waypoints;
        const res = await supabase.from('shipments').update(payload).eq('id', shipment.id).eq('user_id', userId);
        updateError = res.error;
      }

      if (updateError) throw updateError;

      setMilestones(updatedHistory);
      setRouteWaypoints(updatedWaypoints);
      setIsOnHold(isHold);

      const updatedShipment = {
        ...shipment,
        status: newStatus,
        is_on_hold: isHold,
        history: updatedHistory,
        route_waypoints: updatedWaypoints
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
            {/* Master Controls & Automation */}
            <section className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-fedex-purple/10 rounded-lg">
                    <Sliders className="w-4 h-4 text-fedex-purple" />
                  </div>
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900">Master Automation & Overrides</h3>
                    <p className="text-[10px] text-slate-400">Database bound • instant sync</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Auto-Advance Timeline Toggle */}
                <div className="bg-slate-50 border border-slate-200 p-4 rounded-2xl flex flex-col justify-between space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-fedex-purple" />
                        <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Auto-Advance</span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Progresses through the 8 scheduled milestones as timestamps arrive.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleAutoAdvance}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        autoAdvance ? 'bg-fedex-purple' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          autoAdvance ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                      autoAdvance ? 'bg-purple-100 text-fedex-purple' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {autoAdvance ? 'Active Progression' : 'Static / Manual'}
                    </span>
                  </div>
                </div>

                {/* ON HOLD Master Override Toggle */}
                <div className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 ${
                  isOnHold 
                    ? 'bg-amber-500/10 border-fedex-orange text-slate-900 shadow-md shadow-fedex-orange/10' 
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Pause className={`w-3.5 h-3.5 ${isOnHold ? 'text-fedex-orange' : 'text-slate-400'}`} />
                        <span className={`text-xs font-black uppercase tracking-wider ${isOnHold ? 'text-fedex-orange' : 'text-slate-800'}`}>
                          ON HOLD Override
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-tight">
                        Freezes milestone progress and triggers the Hold badge on tracking portal.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleHold}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                        isOnHold ? 'bg-fedex-orange' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isOnHold ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>
                  <div>
                    {isOnHold ? (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-fedex-orange text-white flex items-center gap-1.5 animate-pulse w-fit">
                        <span className="w-1.5 h-1.5 rounded-full bg-white" />
                        HOLD ACTIVE — SHIPMENT FROZEN
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
                        Transit Normal
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* 8-Stage Route & Waypoints Engine */}
            <section className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-fedex-orange/10 rounded-lg">
                    <Route className="w-4 h-4 text-fedex-orange" />
                  </div>
                  <div>
                    <h3 className="font-black text-xs uppercase tracking-[0.2em] text-slate-900">FedEx 8-Stage Logistics Engine</h3>
                    <p className="text-[10px] text-slate-400">AI-calculated milestones & FedEx transit hubs</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleGenerate8StageRoute}
                    disabled={isCalculatingRoute}
                    className="flex items-center gap-2 bg-fedex-purple hover:bg-purple-700 disabled:opacity-60 text-white px-3.5 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all shadow-sm active:scale-95 cursor-pointer"
                  >
                    <Sparkles className={`w-3 h-3 text-amber-300 ${isCalculatingRoute ? 'animate-spin' : ''}`} />
                    {isCalculatingRoute 
                      ? 'AI Calculating Route...' 
                      : milestones.length === 8 
                      ? 'AI Recalculate Route' 
                      : 'AI Calculate Route'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowMilestoneEngine(!showMilestoneEngine)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-900 transition-colors"
                    title="Toggle milestone editor"
                  >
                    {showMilestoneEngine ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* AI Routing Context Banner */}
              {showMilestoneEngine && (aiHubName || aiRoutingSummary) && (
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

              {/* Milestones List & Inline Overrides */}
              {showMilestoneEngine && (
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">
                    <span>{milestones.length} Stage Nodes Configured</span>
                    <div className="flex items-center gap-2">
                      {milestones.length === 8 && (
                        <button
                          type="button"
                          onClick={handleRespaceTimestamps}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[10px] uppercase tracking-wider transition-all"
                          title="Evenly re-space Stages 2-8 into the future up to Est. Delivery"
                        >
                          <Clock className="w-3 h-3 text-fedex-purple" />
                          Re-Space Timestamps
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={isSavingMilestones}
                        onClick={handleSaveMilestones}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all disabled:opacity-50"
                      >
                        {isSavingMilestones ? (
                          <Activity className="w-3 h-3 animate-spin" />
                        ) : milestonesSuccess ? (
                          <CheckCircle2 className="w-3 h-3 text-white" />
                        ) : (
                          <Save className="w-3 h-3" />
                        )}
                        {milestonesSuccess ? 'Schedule Saved!' : 'Save Schedule'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {milestones.map((item, idx) => {
                      const isEditing = editingMilestoneIdx === idx;
                      const isActive = milestoneEval.activeStageIndex === idx && !milestoneEval.isOnHold;
                      const isCompleted = milestoneEval.completedStageIndices.includes(idx);
                      const isUpcoming = milestoneEval.upcomingStageIndices.includes(idx);
                      const isHoldStage = milestoneEval.isOnHold && milestoneEval.activeStageIndex === idx;

                      return (
                        <div
                          key={idx}
                          className={`border rounded-xl p-3 text-xs transition-all ${
                            isHoldStage
                              ? 'bg-red-50/50 border-red-300'
                              : isActive
                              ? 'bg-purple-50/50 border-fedex-purple/40 ring-1 ring-fedex-purple/10'
                              : isCompleted
                              ? 'bg-emerald-50/30 border-emerald-200'
                              : 'bg-slate-50 border-slate-200 hover:border-fedex-purple/30'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-5 h-5 rounded-full font-black text-[10px] flex items-center justify-center shrink-0 ${
                                isHoldStage
                                  ? 'bg-red-600 text-white'
                                  : isActive
                                  ? 'bg-fedex-purple text-white shadow-sm'
                                  : isCompleted
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-600'
                              }`}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-black text-slate-800 text-xs truncate">
                                    {item.status_name}
                                  </p>
                                  {isHoldStage ? (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-600 text-white">
                                      HOLD
                                    </span>
                                  ) : isActive ? (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-fedex-purple text-white flex items-center gap-1 shadow-sm">
                                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                      ACTIVE
                                    </span>
                                  ) : isCompleted ? (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                                      COMPLETED
                                    </span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
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

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono text-slate-500 hidden sm:inline-block">
                                {isUpcoming ? 'Scheduled: ' : ''}
                                {new Date(item.timestamp).toLocaleString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              {!isActive && (
                                <button
                                  type="button"
                                  disabled={isSavingMilestones}
                                  onClick={() => handleDirectStageAdvance(item.status_name as ShipmentStatus)}
                                  className="px-2 py-1 bg-fedex-purple/10 hover:bg-fedex-purple text-fedex-purple hover:text-white rounded-md text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1 shrink-0"
                                  title={`Advance to ${item.status_name} (sets timestamp to NOW and recalculates future stages)`}
                                >
                                  <Play className="w-2.5 h-2.5" />
                                  <span>Advance</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setEditingMilestoneIdx(isEditing ? null : idx)}
                                className="p-1.5 text-slate-400 hover:text-fedex-purple hover:bg-white rounded-lg transition-colors"
                                title="Edit milestone parameters"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Inline Milestone Editor */}
                          {isEditing && (
                            <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-3 rounded-lg">
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Milestone Stage Text
                                </label>
                                <input
                                  type="text"
                                  value={item.status_name}
                                  onChange={(e) => handleMilestoneChange(idx, 'status_name', e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:border-fedex-orange"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Facility / City / Hub Location
                                </label>
                                <input
                                  type="text"
                                  value={item.location}
                                  onChange={(e) => handleMilestoneChange(idx, 'location', e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-800 outline-none focus:border-fedex-orange"
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Scheduled Timestamp (ISO)
                                </label>
                                <input
                                  type="text"
                                  value={item.timestamp}
                                  onChange={(e) => handleMilestoneChange(idx, 'timestamp', e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-700 outline-none focus:border-fedex-orange"
                                />
                              </div>
                              <div className="space-y-1 sm:col-span-2">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                  Description Notes
                                </label>
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={(e) => handleMilestoneChange(idx, 'description', e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-fedex-orange"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

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
                      onChange={(e) => {
                        const nextStatus = e.target.value as ShipmentStatus;
                        setNewStatus(nextStatus);
                        // Populate location and description from existing stage if user hasn't explicitly customized yet
                        const existingStage = milestones.find(m => m.status_name === nextStatus);
                        if (existingStage) {
                          if (existingStage.location) {
                            setLocation(existingStage.location);
                          }
                          if (existingStage.description) {
                            setDescription(existingStage.description);
                          }
                        }
                      }}
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
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-slate-900 font-black text-xs uppercase tracking-[0.2em] flex items-center gap-2">
                <div className="p-2 bg-slate-100 rounded-lg">
                  <History className="w-4 h-4 text-slate-500" />
                </div>
                Transmission History
              </h3>
              <span className="text-[10px] font-bold font-mono text-slate-400">
                {(milestones.length > 0 ? milestones : shipment.history).length} Nodes
              </span>
            </div>

            {isOnHold && (
              <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-fedex-orange text-slate-900 flex items-start gap-3 shadow-md shadow-fedex-orange/10">
                <div className="p-2 rounded-xl bg-fedex-orange text-white shrink-0 animate-pulse">
                  <Pause className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black uppercase tracking-widest text-fedex-orange">
                      ON HOLD Override Engaged
                    </span>
                    <span className="w-2 h-2 rounded-full bg-fedex-orange animate-ping" />
                  </div>
                  <p className="text-xs text-slate-600 leading-snug">
                    Real-time timeline progression is frozen at the active step. The tracking portal displays the dynamic <strong className="text-fedex-orange">ON HOLD</strong> alert badge while preserving original milestone sequences.
                  </p>
                </div>
              </div>
            )}

            <div className="relative pl-8 space-y-10 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200">
              {(milestones.length > 0 ? milestones : (shipment.history || [])).map((item, idx) => {
                const isActive = milestoneEval.activeStageIndex === idx && !milestoneEval.isOnHold;
                const isCompleted = milestoneEval.completedStageIndices.includes(idx);
                const isUpcoming = milestoneEval.upcomingStageIndices.includes(idx);
                const isHoldStage = milestoneEval.isOnHold && milestoneEval.activeStageIndex === idx;

                return (
                  <div key={idx} className="relative group">
                    <div className={`absolute -left-[30px] top-1.5 w-5 h-5 rounded-full border-4 border-slate-50 transition-all z-10 ${
                      isHoldStage 
                        ? 'bg-red-500 ring-4 ring-red-500/20 scale-110'
                        : isActive 
                        ? 'bg-fedex-purple ring-4 ring-fedex-purple/20 scale-110 animate-pulse' 
                        : isCompleted
                        ? 'bg-emerald-500 ring-2 ring-emerald-500/20'
                        : 'bg-slate-300'
                    }`} />
                    <div className="flex flex-col">
                      <div className="flex flex-wrap items-center gap-2.5 mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded shadow-sm border ${
                          isHoldStage
                            ? 'text-red-600 border-red-200 bg-red-50'
                            : isActive 
                            ? 'text-fedex-purple border-purple-200 bg-purple-50 font-black' 
                            : isCompleted
                            ? 'text-emerald-700 border-emerald-200 bg-emerald-50'
                            : 'text-slate-400 border-slate-200 bg-slate-50'
                        }`}>
                          {item.status_name}
                        </span>

                        {isHoldStage ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-red-600 text-white">
                            ON HOLD
                          </span>
                        ) : isActive ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-fedex-purple text-white flex items-center gap-1 shadow-sm">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            ACTIVE STAGE
                          </span>
                        ) : isCompleted ? (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
                            COMPLETED
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-slate-100 text-slate-500 border border-slate-200">
                            UPCOMING
                          </span>
                        )}

                        <span className="text-slate-400 text-[9px] font-bold uppercase tracking-tight">
                          {(() => {
                            const date = new Date(item.timestamp);
                            const d = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                            const t = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
                            return isUpcoming ? `Scheduled: ${d} • ${t}` : `${d} • ${t}`;
                          })()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-900 text-xs font-black uppercase tracking-tight mb-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 group-hover:text-fedex-purple transition-colors" />
                        {item.location}
                      </div>
                      <p className={`text-[11px] leading-relaxed tracking-tight p-4 rounded-2xl border shadow-sm ${
                        isActive
                          ? 'bg-purple-50/40 border-fedex-purple/20 text-slate-800 font-bold'
                          : isCompleted
                          ? 'bg-white border-slate-100 text-slate-600 font-medium'
                          : 'bg-slate-50/50 border-slate-100 text-slate-400 font-normal'
                      }`}>
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
