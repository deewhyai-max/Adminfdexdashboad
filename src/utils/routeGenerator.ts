import { ShipmentHistoryItem, ShipmentStatus, RouteWaypoint } from '../types';

export const FEDEX_8_STAGES: { stage: number; status: ShipmentStatus; defaultDescription: string }[] = [
  {
    stage: 1,
    status: 'Shipping label created',
    defaultDescription: 'Shipping label has been created. The package has not yet been handed to FedEx.'
  },
  {
    stage: 2,
    status: 'Package received by FedEx',
    defaultDescription: 'Package received and scanned into the FedEx origin logistics network.'
  },
  {
    stage: 3,
    status: 'In Transit',
    defaultDescription: 'Package arrived at regional sorting facility. Processing through automated conveyor sort.'
  },
  {
    stage: 4,
    status: 'On the way',
    defaultDescription: 'In transit between transit gateways and en route to destination distribution center.'
  },
  {
    stage: 5,
    status: 'Arriving at destination facility',
    defaultDescription: 'Package has arrived at the destination regional gateway ramp facility.'
  },
  {
    stage: 6,
    status: 'At local FedEx facility',
    defaultDescription: 'Package sorted at local destination delivery station. Prepared for courier route dispatch.'
  },
  {
    stage: 7,
    status: 'Out for Delivery',
    defaultDescription: 'Package is on FedEx vehicle for delivery. Final delivery dispatch active.'
  },
  {
    stage: 8,
    status: 'Delivered',
    defaultDescription: 'Package delivered to recipient destination. Shipment completed successfully.'
  }
];

// Helper to extract a city/name from an address string
export function extractCityOrRegion(address: string | undefined | null, fallback: string): string {
  if (!address || !address.trim()) return fallback;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(1, 3).join(', ');
  }
  return parts[0] || fallback;
}

export interface RouteGeneratorOptions {
  origin: string;
  senderAddress?: string;
  destination: string;
  recipientName?: string;
  senderName?: string;
  serviceType?: string;
  packageType?: string;
  weight?: number;
  weightUnit?: string;
  startTime?: string;
  estimatedDeliveryDate?: string;
  isDryIce?: boolean;
  isHazardous?: boolean;
  isSaturdayDelivery?: boolean;
}

export interface GeneratedRoutePlan {
  history: ShipmentHistoryItem[];
  route_waypoints: RouteWaypoint[];
  ai_generated?: boolean;
  hub_name?: string;
  routing_summary?: string;
}

// Select realistic FedEx hub based on geographic hints
export function getSmartFedExHub(origin: string, destination: string, serviceType?: string): { hubName: string; hubLocation: string } {
  const text = `${origin} ${destination} ${serviceType || ''}`.toLowerCase();
  if (text.includes('japan') || text.includes('tokyo') || text.includes('china') || text.includes('asia') || text.includes('singapore') || text.includes('hong kong') || text.includes('seoul')) {
    return { hubName: "FedEx Asia-Pacific SuperHub", hubLocation: "Guangzhou Baiyun Airport Hub (CAN), China" };
  }
  if (text.includes('france') || text.includes('paris') || text.includes('germany') || text.includes('europe') || text.includes('uk') || text.includes('london') || text.includes('italy') || text.includes('spain') || text.includes('amsterdam')) {
    return { hubName: "FedEx European Hub", hubLocation: "Roissy-Charles de Gaulle Airport (CDG), France" };
  }
  if (text.includes('dubai') || text.includes('uae') || text.includes('india') || text.includes('middle east')) {
    return { hubName: "FedEx Middle East & Indian Subcontinent Hub", hubLocation: "Dubai South Aviation City Hub (DXB), UAE" };
  }
  if (text.includes('ground')) {
    return { hubName: "FedEx Ground National Interchange", hubLocation: "Kansas City Regional Sort Hub, MO" };
  }
  if (text.includes('west') || text.includes('california') || text.includes('seattle') || text.includes('san francisco') || text.includes('los angeles') || text.includes('portland')) {
    return { hubName: "FedEx West Coast Regional Hub", hubLocation: "Oakland International Airport Ramp (OAK), CA" };
  }
  if (text.includes('new york') || text.includes('boston') || text.includes('philadelphia') || text.includes('new jersey') || text.includes('east')) {
    return { hubName: "FedEx Northeast & Transatlantic Ramp", hubLocation: "Newark Liberty Airport Ramp (EWR), NJ" };
  }
  return { hubName: "FedEx World Hub (SuperHub)", hubLocation: "Memphis SuperHub (KMEM), TN" };
}

// Calculate 8-stage spaced timestamps according to fixed FedEx timeline rules
export function calculate8StageSpacedTimestamps(
  startTime?: string | Date,
  estimatedDeliveryDate?: string | Date
): string[] {
  const now = new Date();

  // Rule 1: Stage 1 (Shipping label created) set to NOW() (the exact creation date/time)
  const start = now;

  // Rule 3: Stage 8 (Delivered) target on estimated_delivery_date
  let end: Date;
  if (estimatedDeliveryDate) {
    if (estimatedDeliveryDate instanceof Date) {
      end = new Date(estimatedDeliveryDate.getTime());
    } else if (typeof estimatedDeliveryDate === 'string' && estimatedDeliveryDate.trim()) {
      const raw = estimatedDeliveryDate.trim();
      if (raw.includes('T')) {
        end = new Date(raw);
      } else {
        // Standard FedEx end-of-day target arrival time 17:00:00 (5:00 PM) on delivery day
        end = new Date(`${raw}T17:00:00`);
      }
    } else {
      end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
    }
  } else {
    end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
  }

  // Guard: if end is invalid or less than 6 hours into the future, fallback to 72 hours from start
  if (isNaN(end.getTime()) || end.getTime() <= start.getTime() + 6 * 3600 * 1000) {
    end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
  }

  // Rule 2: Evenly divide total duration across Stages 2 through 7 (7 total intervals from Stage 1 to Stage 8)
  const totalDurationMs = end.getTime() - start.getTime();
  const stepMs = totalDurationMs / 7;

  const timestamps: string[] = [];
  let prevMs = start.getTime();

  for (let stage = 1; stage <= 8; stage++) {
    if (stage === 1) {
      timestamps.push(start.toISOString());
    } else if (stage === 8) {
      timestamps.push(end.toISOString());
    } else {
      const stepIndex = stage - 1; // 1 to 6
      const rawMs = start.getTime() + stepIndex * stepMs;
      // Round to nearest minute for clean, realistic operational timestamps
      let roundedMs = Math.round(rawMs / 60000) * 60000;

      // Enforce strict chronological future progression (at least 15 min gap)
      if (roundedMs <= prevMs) {
        roundedMs = prevMs + 15 * 60 * 1000;
      }
      if (roundedMs >= end.getTime()) {
        roundedMs = end.getTime() - (8 - stage) * 15 * 60 * 1000;
      }

      prevMs = roundedMs;
      timestamps.push(new Date(roundedMs).toISOString());
    }
  }

  return timestamps;
}

export interface MilestoneEvaluation {
  activeStatus: ShipmentStatus;
  activeStageIndex: number;
  completedStageIndices: number[];
  upcomingStageIndices: number[];
  isDelivered: boolean;
  isOnHold: boolean;
  nextMilestoneTime?: string | null;
}

// Active vs Upcoming Stage Evaluation Logic:
// Evaluates tracking stages based on current live clock time.
// Stage 1 is active on creation; Stages 2-8 remain unfulfilled / UPCOMING
// until their scheduled future timestamp is reached or exceeded.
export function evaluateShipmentMilestones(
  history: ShipmentHistoryItem[],
  autoAdvance?: boolean | null,
  isOnHold?: boolean | null,
  fallbackStatus?: ShipmentStatus
): MilestoneEvaluation {
  if (!history || history.length === 0) {
    return {
      activeStatus: fallbackStatus || 'Shipping label created',
      activeStageIndex: 0,
      completedStageIndices: [],
      upcomingStageIndices: [],
      isDelivered: false,
      isOnHold: Boolean(isOnHold),
      nextMilestoneTime: null
    };
  }

  // 1. If ON HOLD master override is active
  if (isOnHold) {
    let activeIdx = 0;
    if (fallbackStatus) {
      const match = history.findIndex(h => h.status_name === fallbackStatus);
      if (match >= 0) activeIdx = match;
    }
    return {
      activeStatus: 'On Hold',
      activeStageIndex: activeIdx,
      completedStageIndices: history.map((_, i) => i).filter(i => i < activeIdx),
      upcomingStageIndices: history.map((_, i) => i).filter(i => i > activeIdx),
      isDelivered: false,
      isOnHold: true,
      nextMilestoneTime: null
    };
  }

  // 2. If Auto-Advance is explicitly disabled (Manual Override mode)
  if (autoAdvance === false) {
    let activeIdx = 0;
    if (fallbackStatus) {
      const match = history.findIndex(h => h.status_name === fallbackStatus);
      if (match >= 0) activeIdx = match;
    }
    return {
      activeStatus: fallbackStatus || history[activeIdx]?.status_name || 'Shipping label created',
      activeStageIndex: activeIdx,
      completedStageIndices: history.map((_, i) => i).filter(i => i < activeIdx),
      upcomingStageIndices: history.map((_, i) => i).filter(i => i > activeIdx),
      isDelivered: fallbackStatus === 'Delivered',
      isOnHold: false,
      nextMilestoneTime: history[activeIdx + 1]?.timestamp || null
    };
  }

  // 3. Natural clock-based auto-advance:
  // As live clock time passes, tracking naturally advances only when milestone timestamp <= now
  const nowMs = Date.now();
  let latestReachedIdx = 0; // Stage 1 is guaranteed reached at creation (NOW)

  for (let i = 0; i < history.length; i++) {
    const itemTime = new Date(history[i].timestamp).getTime();
    if (!isNaN(itemTime) && itemTime <= nowMs) {
      latestReachedIdx = i;
    }
  }

  const activeItem = history[latestReachedIdx] || history[0];
  const isDelivered = latestReachedIdx === history.length - 1 && activeItem.status_name === 'Delivered';
  const nextMilestone = history[latestReachedIdx + 1];

  return {
    activeStatus: activeItem.status_name as ShipmentStatus,
    activeStageIndex: latestReachedIdx,
    completedStageIndices: history.map((_, i) => i).filter(i => i < latestReachedIdx),
    upcomingStageIndices: history.map((_, i) => i).filter(i => i > latestReachedIdx),
    isDelivered,
    isOnHold: false,
    nextMilestoneTime: nextMilestone ? nextMilestone.timestamp : null
  };
}

// Clean location string utility to prevent embedding personal names into location fields
export function cleanLocationString(
  rawLocation: string | undefined | null,
  senderName?: string | null,
  recipientName?: string | null,
  fallback = 'FedEx Transit Facility'
): string {
  if (!rawLocation || !rawLocation.trim()) return fallback;
  let loc = rawLocation.trim();

  // Strip prefix/suffix identifiers
  loc = loc.replace(/^(Sender|Recipient|Receiver|Customer|Shipper|To|From):\s*/i, '');
  loc = loc.replace(/\s*-\s*(Sender|Recipient|Receiver|Customer|Shipper):.*$/i, '');

  if (senderName && senderName.trim()) {
    const sName = senderName.trim();
    const escaped = sName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    loc = loc.replace(new RegExp(`^${escaped}\\s*[-–—:,/]\\s*`, 'i'), '');
    loc = loc.replace(new RegExp(`\\s*[-–—:,/]\\s*${escaped}$`, 'i'), '');
    loc = loc.replace(new RegExp(`\\s*\\(${escaped}\\)`, 'i'), '');
  }

  if (recipientName && recipientName.trim()) {
    const rName = recipientName.trim();
    const escaped = rName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    loc = loc.replace(new RegExp(`^${escaped}\\s*[-–—:,/]\\s*`, 'i'), '');
    loc = loc.replace(new RegExp(`\\s*[-–—:,/]\\s*${escaped}$`, 'i'), '');
    loc = loc.replace(new RegExp(`\\s*\\(${escaped}\\)`, 'i'), '');
  }

  loc = loc.trim().replace(/^[-–—:,/]\s*/, '').replace(/\s*[-–—:,/]$/, '').trim();
  return loc || fallback;
}

export const CANONICAL_STAGE_ORDER: ShipmentStatus[] = [
  'Shipping label created',
  'Package received by FedEx',
  'In Transit',
  'On the way',
  'Arriving at destination facility',
  'At local FedEx facility',
  'Out for Delivery',
  'Delivered'
];

export interface DeduplicationOptions {
  origin?: string | null;
  senderAddress?: string | null;
  destination?: string | null;
  senderName?: string | null;
  recipientName?: string | null;
  serviceType?: string | null;
  startTime?: string | Date | null;
  estimatedDeliveryDate?: string | Date | null;
}

/**
 * Deduplication Cleanup Utility:
 * Enforces exactly ONE array of 8 ordered milestone objects inside the history JSONB payload (Index 0 through 7).
 * Strictly prevents .push() append loops, removes duplicated stages, restores canonical ordering,
 * spaces timestamps chronologically, and enforces strict physical location mapping:
 * - Stages 1 & 2: Exact Origin string provided in form
 * - Stages 3 to 6: Clean transit hub / corridor names (no personal names)
 * - Stages 7 & 8: Exact Destination string provided in form
 */
export function deduplicateAndEnforce8Stages(
  rawHistory: any[] | undefined | null,
  options: DeduplicationOptions = {}
): ShipmentHistoryItem[] {
  const originClean = (options.origin || options.senderAddress || '').trim() || 'Origin Facility';
  const destClean = (options.destination || '').trim() || 'Destination Address';
  const destCity = extractCityOrRegion(destClean, 'Destination Hub');
  const hub = getSmartFedExHub(originClean, destClean, options.serviceType || undefined);

  // Canonical stage locations adhering to strict mapping rules
  const canonicalLocations: string[] = [
    originClean,                                      // Stage 1: exact origin
    originClean,                                      // Stage 2: exact origin
    hub.hubLocation,                                  // Stage 3: transit hub
    `FedEx Gateway Transit Corridor (${hub.hubName})`, // Stage 4: transit corridor
    `${destCity} Regional Ramp Terminal`,             // Stage 5: destination ramp
    `FedEx Destination Station, ${destCity}`,         // Stage 6: local facility
    destClean,                                        // Stage 7: exact destination
    destClean                                         // Stage 8: exact destination
  ];

  const defaultDescriptions = [
    'Shipping label has been created. Package awaiting origin carrier pickup.',
    'Picked up by FedEx. Scanned and verified at origin station.',
    `Arrived at ${hub.hubName}. Automated optical sort scanning in progress.`,
    `Departed ${hub.hubName} via FedEx Express transport to destination gateway.`,
    `Flight arrived at ${destCity} regional air ramp. Inbound sort scan complete.`,
    `Package arrived at local delivery station in ${destCity}. Staged for courier dispatch.`,
    'On FedEx delivery vehicle for final delivery. Courier route active.',
    'Delivered. Package securely delivered to destination.'
  ];

  const baselineTimestamps = calculate8StageSpacedTimestamps(
    options.startTime || undefined,
    options.estimatedDeliveryDate || undefined
  );

  const rawArray = Array.isArray(rawHistory) ? rawHistory : [];

  const result: ShipmentHistoryItem[] = [];

  for (let stageIdx = 0; stageIdx < CANONICAL_STAGE_ORDER.length; stageIdx++) {
    const targetStatus = CANONICAL_STAGE_ORDER[stageIdx];
    const targetNorm = targetStatus.toLowerCase();

    // Find matching items in raw history
    const matches = rawArray.filter((item: any) => {
      if (!item) return false;
      const sName = (item.status_name || item.stage_name || '').toString().toLowerCase().trim();
      if (sName === targetNorm) return true;
      if (stageIdx === 0 && (sName.includes('label created') || sName.includes('shipping label'))) return true;
      if (stageIdx === 1 && (sName.includes('package received') || sName.includes('picked up'))) return true;
      if (stageIdx === 2 && sName === 'in transit') return true;
      if (stageIdx === 3 && (sName === 'on the way' || sName.includes('way'))) return true;
      if (stageIdx === 4 && (sName.includes('arriving at destination') || sName.includes('destination facility'))) return true;
      if (stageIdx === 5 && (sName.includes('at local') || sName.includes('local fedex'))) return true;
      if (stageIdx === 6 && (sName.includes('out for delivery') || sName.includes('delivery route'))) return true;
      if (stageIdx === 7 && (sName.includes('delivered') && !sName.includes('out'))) return true;
      return false;
    });

    let matchedItem: any = null;
    if (matches.length > 0) {
      matchedItem = matches[0];
    } else if (rawArray.length === 8 && rawArray[stageIdx]) {
      matchedItem = rawArray[stageIdx];
    }

    // Determine clean physical location
    let finalLocation = canonicalLocations[stageIdx];
    if (stageIdx >= 2 && stageIdx <= 5 && matchedItem && matchedItem.location) {
      const cleaned = cleanLocationString(
        matchedItem.location,
        options.senderName,
        options.recipientName,
        canonicalLocations[stageIdx]
      );
      if (cleaned && cleaned !== originClean && cleaned !== destClean) {
        finalLocation = cleaned;
      }
    }

    // Determine timestamp
    let finalTimestamp = baselineTimestamps[stageIdx];
    if (matchedItem && matchedItem.timestamp) {
      const parsed = new Date(matchedItem.timestamp);
      if (!isNaN(parsed.getTime())) {
        finalTimestamp = parsed.toISOString();
      }
    }

    // Determine description
    let finalDescription = defaultDescriptions[stageIdx];
    if (matchedItem && matchedItem.description && matchedItem.description.trim()) {
      finalDescription = matchedItem.description.trim();
    }

    result.push({
      status_name: targetStatus,
      location: finalLocation,
      timestamp: finalTimestamp,
      description: finalDescription
    });
  }

  // Ensure chronological monotonicity: stage[i] timestamp >= stage[i-1] timestamp
  for (let i = 1; i < result.length; i++) {
    const prevMs = new Date(result[i - 1].timestamp).getTime();
    const currMs = new Date(result[i].timestamp).getTime();
    if (isNaN(currMs) || currMs <= prevMs) {
      result[i].timestamp = new Date(prevMs + 30 * 60 * 1000).toISOString();
    }
  }

  return result;
}

/**
 * Manual Stage Override Logic:
 * When an admin manually advances a shipment to a specific stage (e.g. Stage 4: "On the way"):
 * 1. Mark Stage 4's timestamp as NOW() (or selected manual time) and set its state to active.
 * 2. Automatically recalculate the timestamps for ALL SUBSEQUENT UNREACHED STAGES (Stages 5-8)
 *    so their dates/times sit in the FUTURE starting from the new manual timestamp up to estimated_delivery_date.
 * 3. Never append (.push()); map over the fixed 8-stage indices.
 * 4. Strictly prevent duplicate status names or out-of-order steps.
 */
export function advanceShipmentToStage(
  currentHistory: ShipmentHistoryItem[] | undefined | null,
  targetStatus: ShipmentStatus,
  options: {
    manualTimestamp?: string | null;
    estimatedDeliveryDate?: string | null;
    location?: string | null;
    description?: string | null;
    origin?: string | null;
    destination?: string | null;
    senderName?: string | null;
    recipientName?: string | null;
    serviceType?: string | null;
  } = {}
): {
  history: ShipmentHistoryItem[];
  route_waypoints: RouteWaypoint[];
  activeStageIndex: number;
} {
  // Step 1: Ensure fixed 8-stage canonical single array
  const stages = deduplicateAndEnforce8Stages(currentHistory, {
    origin: options.origin,
    destination: options.destination,
    senderName: options.senderName,
    recipientName: options.recipientName,
    serviceType: options.serviceType,
    estimatedDeliveryDate: options.estimatedDeliveryDate
  });

  const targetIdx = CANONICAL_STAGE_ORDER.indexOf(targetStatus);

  if (targetIdx === -1) {
    // Non-canonical stage (e.g. 'On Hold', 'Exception')
    const waypoints: RouteWaypoint[] = stages.map((item, idx) => ({
      stage: idx + 1,
      stage_name: item.status_name,
      location: item.location,
      estimated_time: item.timestamp,
      description: item.description
    }));
    return {
      history: stages,
      route_waypoints: waypoints,
      activeStageIndex: 0
    };
  }

  // Step 2: Mark target stage timestamp as manual time (or NOW)
  const manualDate = options.manualTimestamp ? new Date(options.manualTimestamp) : new Date();
  const targetTimeMs = isNaN(manualDate.getTime()) ? Date.now() : manualDate.getTime();
  stages[targetIdx].timestamp = new Date(targetTimeMs).toISOString();

  // Update location if provided, respecting clean location rules
  if (options.location && options.location.trim()) {
    if (targetIdx === 0 || targetIdx === 1) {
      stages[targetIdx].location = (options.origin || '').trim() || stages[targetIdx].location;
    } else if (targetIdx === 6 || targetIdx === 7) {
      stages[targetIdx].location = (options.destination || '').trim() || stages[targetIdx].location;
    } else {
      stages[targetIdx].location = cleanLocationString(
        options.location,
        options.senderName,
        options.recipientName,
        stages[targetIdx].location
      );
    }
  }

  // Update description if provided
  if (options.description && options.description.trim()) {
    stages[targetIdx].description = options.description.trim();
  }

  // Step 3: Prior stages (0 to targetIdx - 1)
  // Ensure their timestamps sit in the past relative to targetTimeMs
  let priorStepBackMs = targetTimeMs;
  for (let i = targetIdx - 1; i >= 0; i--) {
    const existingMs = new Date(stages[i].timestamp).getTime();
    if (isNaN(existingMs) || existingMs >= priorStepBackMs) {
      priorStepBackMs = priorStepBackMs - 45 * 60 * 1000;
      stages[i].timestamp = new Date(priorStepBackMs).toISOString();
    } else {
      priorStepBackMs = existingMs;
    }
  }

  // Step 4: Automatically recalculate timestamps for ALL SUBSEQUENT UNREACHED STAGES
  // so their dates/times sit in the FUTURE starting from the new manual timestamp up to estimated_delivery_date
  const subsequentCount = 7 - targetIdx;
  if (subsequentCount > 0) {
    let endMs: number;
    if (options.estimatedDeliveryDate) {
      const raw = options.estimatedDeliveryDate.trim();
      const parsedEnd = raw.includes('T') ? new Date(raw) : new Date(`${raw}T17:00:00`);
      if (!isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > targetTimeMs + subsequentCount * 30 * 60 * 1000) {
        endMs = parsedEnd.getTime();
      } else {
        endMs = targetTimeMs + Math.max(subsequentCount * 12 * 3600 * 1000, 24 * 3600 * 1000);
      }
    } else {
      endMs = targetTimeMs + Math.max(subsequentCount * 12 * 3600 * 1000, 48 * 3600 * 1000);
    }

    const totalSpanMs = endMs - targetTimeMs;
    const stepMs = totalSpanMs / subsequentCount;

    let runningMs = targetTimeMs;
    for (let step = 1; step <= subsequentCount; step++) {
      const nextIdx = targetIdx + step;
      if (nextIdx === 7) {
        stages[7].timestamp = new Date(endMs).toISOString();
      } else {
        const rawMs = targetTimeMs + step * stepMs;
        let roundedMs = Math.round(rawMs / 60000) * 60000;
        if (roundedMs <= runningMs) {
          roundedMs = runningMs + 30 * 60 * 1000;
        }
        if (roundedMs >= endMs) {
          roundedMs = endMs - (7 - nextIdx) * 30 * 60 * 1000;
        }
        runningMs = roundedMs;
        stages[nextIdx].timestamp = new Date(roundedMs).toISOString();
      }
    }
  }

  // Step 5: Build matching 8-stage route_waypoints
  const waypoints: RouteWaypoint[] = stages.map((item, idx) => ({
    stage: idx + 1,
    stage_name: item.status_name,
    location: item.location,
    estimated_time: item.timestamp,
    description: item.description
  }));

  return {
    history: stages,
    route_waypoints: waypoints,
    activeStageIndex: targetIdx
  };
}

// Local synchronous fallback generator ensuring strict clean locations
export function generate8StageRoute(options: RouteGeneratorOptions): GeneratedRoutePlan {
  const originClean = options.origin?.trim() || options.senderAddress?.trim() || 'Origin Location';
  const destClean = options.destination?.trim() || 'Destination Location';

  const destCity = extractCityOrRegion(destClean, 'Destination Hub');
  const hub = getSmartFedExHub(originClean, destClean, options.serviceType);

  // Strict location mapping:
  // - Stages 1 & 2: exact Origin
  // - Stages 3 to 6: transit hub names / corridors
  // - Stages 7 & 8: exact Destination
  const stageLocations: string[] = [
    originClean,
    originClean,
    hub.hubLocation,
    `FedEx Gateway Transit Corridor (${hub.hubName})`,
    `${destCity} Regional Ramp Terminal`,
    `FedEx Destination Station, ${destCity}`,
    destClean,
    destClean
  ];

  const stageDescriptions: string[] = [
    'Shipping label has been created. Package awaiting origin carrier pickup.',
    'Picked up by FedEx. Scanned and verified at origin station.',
    `Arrived at ${hub.hubName}. Automated optical sort scanning in progress.`,
    `Departed ${hub.hubName} via FedEx Express flight leg to destination gateway.`,
    `Flight arrived at ${destCity} regional air ramp. Inbound sort scan complete.`,
    `Package arrived at local delivery station in ${destCity}. Staged for courier dispatch.`,
    'On FedEx delivery vehicle for final delivery. Courier route active.',
    'Delivered. Package securely delivered to destination.'
  ];

  const stageTimestamps = calculate8StageSpacedTimestamps(options.startTime, options.estimatedDeliveryDate);

  const history: ShipmentHistoryItem[] = [];
  const route_waypoints: RouteWaypoint[] = [];

  FEDEX_8_STAGES.forEach((item, index) => {
    const timeStr = stageTimestamps[index];
    const location = stageLocations[index] || originClean;
    const description = stageDescriptions[index] || item.defaultDescription;

    history.push({
      status_name: item.status,
      location,
      timestamp: timeStr,
      description
    });

    route_waypoints.push({
      stage: item.stage,
      stage_name: item.status,
      location,
      estimated_time: timeStr,
      description
    });
  });

  return {
    history,
    route_waypoints,
    ai_generated: false,
    hub_name: hub.hubName,
    routing_summary: `Routed through ${hub.hubName} (${hub.hubLocation})`
  };
}

// AI-Powered Route Calculation via Server-Side Gemini API
export async function calculateFedExRouteWithAI(options: RouteGeneratorOptions): Promise<GeneratedRoutePlan> {
  try {
    const res = await fetch('/api/fedex/calculate-route', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        origin: options.origin || options.senderAddress,
        destination: options.destination,
        serviceType: options.serviceType,
        packageType: options.packageType,
        weight: options.weight,
        weightUnit: options.weightUnit,
        recipientName: options.recipientName,
        senderName: options.senderName,
        startTime: options.startTime,
        estimatedDeliveryDate: options.estimatedDeliveryDate,
        isDryIce: options.isDryIce,
        isHazardous: options.isHazardous,
        isSaturdayDelivery: options.isSaturdayDelivery
      })
    });

    if (res.ok) {
      const data = await res.json();
      if (data.history && data.history.length === 8) {
        // Run strict deduplication pass and location cleanup
        const cleanHistory = deduplicateAndEnforce8Stages(data.history, {
          origin: options.origin || options.senderAddress,
          destination: options.destination,
          senderName: options.senderName,
          recipientName: options.recipientName,
          serviceType: options.serviceType,
          startTime: options.startTime,
          estimatedDeliveryDate: options.estimatedDeliveryDate
        });

        const cleanWaypoints: RouteWaypoint[] = cleanHistory.map((h, idx) => ({
          stage: idx + 1,
          stage_name: h.status_name,
          location: h.location,
          estimated_time: h.timestamp,
          description: h.description
        }));

        return {
          history: cleanHistory,
          route_waypoints: cleanWaypoints,
          ai_generated: Boolean(data.ai_generated),
          hub_name: data.hub_name,
          routing_summary: data.routing_summary
        };
      }
    }
  } catch (err) {
    console.warn("AI Route Server endpoint call failed, engaging smart local fallback:", err);
  }

  // Graceful fallback to algorithmic FedEx calculation
  return generate8StageRoute(options);
}
