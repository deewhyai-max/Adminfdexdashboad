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

// Helper to extract a clean city/region from an address string (e.g. "123 Main St, Dallas, TX 75201" -> "Dallas, TX 75201")
export function extractCityOrRegion(address: string | undefined | null, fallback: string): string {
  if (!address || !address.trim()) return fallback;
  let text = address.trim();

  // If already a FedEx location
  if (/^FedEx/i.test(text)) {
    return text;
  }

  const parts = text.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) {
    return parts[0].replace(/^[0-9#\s\-/]+/, '').trim() || fallback;
  }
  if (parts.length === 2) {
    // If first part has street number e.g. "123 Main St", take second part
    if (/^[0-9#]/.test(parts[0])) {
      return parts[1];
    }
    return `${parts[0]}, ${parts[1]}`;
  }

  // 3 or more parts, e.g. "123 Main St, Suite 100, Austin, TX 78701"
  const nonStreetParts = parts.filter(p => !/^(apt|suite|ste|unit|bldg|building|floor|fl|rm|room|p\.?o\.?\s*box)\b/i.test(p) && !/^[0-9#]+$/.test(p));
  const candidates = nonStreetParts.length > 0 && /^[0-9]/.test(nonStreetParts[0]) ? nonStreetParts.slice(1) : nonStreetParts;

  if (candidates.length >= 2) {
    return `${candidates[0]}, ${candidates[1]}`;
  }
  if (candidates.length === 1) {
    return candidates[0];
  }

  return `${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
}

// Formats an authentic FedEx location or FedEx Ship Center near the origin city, never the sender's private street address
export function getFedExOriginShipCenter(
  address: string | undefined | null,
  fallback = 'FedEx Ship Center'
): string {
  if (!address || !address.trim()) return fallback;
  const raw = address.trim();

  // If it already explicitly mentions FedEx, preserve it
  if (/fedex/i.test(raw)) {
    return raw;
  }

  const city = extractCityOrRegion(raw, '');
  if (city && city.trim()) {
    const cleanCity = city.replace(/^[0-9#\s\-/]+/, '').trim();
    if (cleanCity) {
      return `FedEx Ship Center, ${cleanCity}`;
    }
  }

  const cleanRaw = raw.replace(/^[0-9#\s\-/]+/, '').trim();
  return cleanRaw ? `FedEx Ship Center, ${cleanRaw}` : fallback;
}

// Aggressively strips any personal or company sender name from an address or location string
export function stripSenderName(
  text: string | undefined | null,
  senderName?: string | null
): string {
  if (!text || !text.trim()) return '';
  let cleaned = text.trim();
  if (!senderName || !senderName.trim()) return cleaned;

  const sName = senderName.trim();
  const sNameLower = sName.toLowerCase();

  // If text is identically the sender name
  if (cleaned.toLowerCase() === sNameLower) return '';

  // 1. Strip common prefixes referencing sender/shipper
  cleaned = cleaned.replace(/^(Sender|Shipper|From|Customer|Shipper Name|Sender Name):\s*/gi, '');
  cleaned = cleaned.replace(/\s*[-–—:,/|]\s*(Sender|Shipper|From|Customer|Shipper Name|Sender Name):?.*$/gi, '');

  // 2. Remove the full sender name case-insensitively wherever it appears
  const escaped = sName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '');

  // 3. If senderName has multiple words, strip individual distinctive name words (length >= 3)
  const genericWords = new Set(['inc', 'llc', 'corp', 'co', 'the', 'and', 'ltd', 'express', 'logistics', 'hub', 'fedex', 'facility', 'station', 'transit', 'route', 'global']);
  const words = sName.split(/\s+/).map(w => w.trim()).filter(w => w.length >= 3 && !genericWords.has(w.toLowerCase()));
  for (const word of words) {
    const escWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(`(^|[\\s,–—\\-:/|])${escWord}([\\s,–—\\-:/|]|$)`, 'gi'), '$1$2');
  }

  // 4. Clean dangling punctuation and spaces
  cleaned = cleaned
    .replace(/^[\s,–—\-:/|]+/, '')
    .replace(/[\s,–—\-:/|]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/,\s*,/g, ', ')
    .replace(/^,\s*/, '')
    .replace(/\s*,$/, '')
    .trim();

  return cleaned;
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

// Clean location string utility to prevent embedding personal names or personal street addresses into location fields.
// Rule: Stages 1 & 2 (index 0 & 1) use an authentic FedEx Ship Center / location near the origin city.
// Stages 3 to 8 (index 2 to 7) are outside transit routes and strictly NEVER use sender address or sender name.
export function cleanLocationString(
  rawLocation: string | undefined | null,
  senderName?: string | null,
  recipientName?: string | null,
  fallback = 'FedEx Transit Facility',
  senderAddress?: string | null,
  stageIndex?: number
): string {
  const isSenderStage = stageIndex === 0 || stageIndex === 1;
  const fedExOriginCenter = getFedExOriginShipCenter(senderAddress || fallback, 'FedEx Ship Center');
  const defaultFallback = isSenderStage
    ? fedExOriginCenter
    : fallback;

  if (!rawLocation || !rawLocation.trim()) return defaultFallback;
  let loc = rawLocation.trim();

  // Strip sender name aggressively
  if (senderName && senderName.trim()) {
    loc = stripSenderName(loc, senderName);
  }

  // Strip recipient name aggressively
  if (recipientName && recipientName.trim()) {
    const rName = recipientName.trim();
    if (loc.toLowerCase() === rName.toLowerCase()) {
      loc = '';
    } else {
      const escR = rName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      loc = loc.replace(new RegExp(escR, 'gi'), '');
    }
  }

  // Strip prefix/suffix identifiers
  loc = loc.replace(/^(Sender|Recipient|Receiver|Customer|Shipper|To|From):\s*/i, '');
  loc = loc.replace(/\s*[-–—:,/]\s*(Sender|Recipient|Receiver|Customer|Shipper):.*$/i, '');
  loc = loc.replace(/^[\s,–—\-:/|]+/, '').replace(/[\s,–—\-:/|]+$/, '').trim();

  // If stageIndex is 0 or 1 (Shipping label created / Package received by FedEx):
  // Must use authentic FedEx locations or FedEx Ship Center, NEVER sender personal street address
  if (isSenderStage) {
    if (!loc) {
      return fedExOriginCenter;
    }
    // If the location matches the sender personal address and doesn't mention FedEx, replace with FedEx Ship Center
    if (senderAddress) {
      const cleanAddr = stripSenderName(senderAddress, senderName);
      if (cleanAddr && (loc.toLowerCase() === cleanAddr.toLowerCase() || (cleanAddr.length > 5 && loc.toLowerCase().includes(cleanAddr.toLowerCase())))) {
        if (!/fedex/i.test(loc)) {
          return fedExOriginCenter;
        }
      }
    }
    // If it looks like a residential/commercial street address (e.g. "123 Main St") without "FedEx"
    if (/^[0-9]+\s+[A-Za-z]/.test(loc) && !/fedex/i.test(loc)) {
      return fedExOriginCenter;
    }
    return loc;
  }

  // If stageIndex >= 2 (transit stages 3 to 8):
  // Strictly CANNOT have sender address or sender name!
  if (senderAddress) {
    const cleanAddr = stripSenderName(senderAddress, senderName);
    if (cleanAddr) {
      const sAddrLower = cleanAddr.toLowerCase();
      if (loc.toLowerCase() === sAddrLower || (sAddrLower.length > 5 && loc.toLowerCase().includes(sAddrLower))) {
        return fallback;
      }
    }
  }

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
 * Recalculate Unfilled Milestones Utility:
 * Strictly respects all manual inputs and timing entered by the user (even if AI was previously used or is toggled off).
 * Any milestone where the user manually set a location, timestamp, status, or description is preserved 100%.
 * Any milestones that are left unfilled, blank, or missing are intelligently recalculated:
 * - Timestamps are smoothly interpolated between filled stages and the estimated delivery date.
 * - Locations follow realistic FedEx transit hub / gateway / local delivery routes.
 * - Monotonic chronological order is guaranteed without overwriting user-specified times.
 */
export function recalculateUnfilledMilestones(
  history: ShipmentHistoryItem[] | undefined | null,
  options: DeduplicationOptions = {}
): ShipmentHistoryItem[] {
  let originClean = stripSenderName(options.senderAddress || options.origin || '', options.senderName);
  if (!originClean) {
    originClean = 'FedEx Origin Facility';
  }
  const fedExOriginCenter = getFedExOriginShipCenter(originClean, 'FedEx Ship Center');

  const destClean = (options.destination || '').trim() || 'Destination Address';
  const destCity = extractCityOrRegion(destClean, 'Destination Hub');
  const hub = getSmartFedExHub(originClean, destClean, options.serviceType || undefined);

  const canonicalLocations: string[] = [
    fedExOriginCenter,                                // Stage 1: FedEx Ship Center / location
    fedExOriginCenter,                                // Stage 2: FedEx Ship Center / location
    hub.hubLocation,                                  // Stage 3: transit hub
    `FedEx Gateway Transit Corridor (${hub.hubName})`, // Stage 4: transit corridor
    `${destCity} Regional Ramp Terminal`,             // Stage 5: destination ramp
    `FedEx Destination Station, ${destCity}`,         // Stage 6: local facility
    `On Route - ${destCity}`,                          // Stage 7: delivery vehicle route
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

  const rawArray = Array.isArray(history) ? history : [];
  
  interface StageState {
    status_name: ShipmentStatus;
    location: string;
    timestamp: string | null;
    description: string;
    isLocationFilled: boolean;
    isTimestampFilled: boolean;
    isStatusFilled: boolean;
    isDescFilled: boolean;
  }

  const stageStates: StageState[] = [];

  for (let i = 0; i < 8; i++) {
    const raw: any = rawArray[i] || {};
    const hasStatus = Boolean(raw.status_name && String(raw.status_name).trim());
    const hasLoc = Boolean(raw.location && String(raw.location).trim());
    const hasDesc = Boolean(raw.description && String(raw.description).trim());
    
    let validTs: string | null = null;
    if (raw.timestamp && String(raw.timestamp).trim()) {
      const parsed = new Date(raw.timestamp);
      if (!isNaN(parsed.getTime())) {
        validTs = parsed.toISOString();
      }
    }

    stageStates.push({
      status_name: hasStatus ? (String(raw.status_name).trim() as ShipmentStatus) : CANONICAL_STAGE_ORDER[i],
      location: hasLoc ? String(raw.location).trim() : '',
      timestamp: validTs,
      description: hasDesc ? String(raw.description).trim() : defaultDescriptions[i],
      isLocationFilled: hasLoc,
      isTimestampFilled: Boolean(validTs),
      isStatusFilled: hasStatus,
      isDescFilled: hasDesc
    });
  }

  // 1. Fill missing locations for unfilled stages or sanitize accidental sender address/name leaks
  for (let i = 0; i < 8; i++) {
    if (!stageStates[i].isLocationFilled || !stageStates[i].location.trim()) {
      stageStates[i].location = canonicalLocations[i];
    } else {
      // If location matches sender name, replace with canonical location
      if (options.senderName && stageStates[i].location.toLowerCase() === options.senderName.trim().toLowerCase()) {
        stageStates[i].location = canonicalLocations[i];
      }
      // For Stage 1 & 2: ensure it uses FedEx Ship Center/location, NEVER the sender's private street address
      if (i === 0 || i === 1) {
        const sAddrLower = originClean.toLowerCase();
        if (
          stageStates[i].location.toLowerCase() === sAddrLower ||
          (sAddrLower.length > 5 && stageStates[i].location.toLowerCase().includes(sAddrLower) && !/fedex/i.test(stageStates[i].location)) ||
          (/^[0-9]+\s+[A-Za-z]/.test(stageStates[i].location) && !/fedex/i.test(stageStates[i].location))
        ) {
          stageStates[i].location = canonicalLocations[i];
        }
      }
      // For Stages 3 to 8: outside transit routes, strictly ensure sender address didn't leak
      if (i >= 2 && originClean) {
        const sAddrLower = originClean.toLowerCase();
        if (stageStates[i].location.toLowerCase() === sAddrLower || (sAddrLower.length > 5 && stageStates[i].location.toLowerCase().includes(sAddrLower))) {
          stageStates[i].location = canonicalLocations[i];
        }
      }
    }
  }

  // 2. Determine anchor times and interpolate timestamps for any stage with missing or unfilled timestamp
  const defaultStartMs = options.startTime 
    ? new Date(options.startTime).getTime() 
    : Date.now();
  const validStartMs = isNaN(defaultStartMs) ? Date.now() : defaultStartMs;

  let defaultEndMs: number;
  if (options.estimatedDeliveryDate) {
    const raw = options.estimatedDeliveryDate.toString().trim();
    const parsed = raw.includes('T') ? new Date(raw) : new Date(`${raw}T17:00:00`);
    defaultEndMs = !isNaN(parsed.getTime()) ? parsed.getTime() : validStartMs + 48 * 3600 * 1000;
  } else {
    defaultEndMs = validStartMs + 48 * 3600 * 1000;
  }
  if (defaultEndMs <= validStartMs) {
    defaultEndMs = validStartMs + 48 * 3600 * 1000;
  }

  // Stage 0 fallback if not filled
  if (!stageStates[0].isTimestampFilled) {
    stageStates[0].timestamp = new Date(validStartMs).toISOString();
  }

  // Segment-based interpolation for missing timestamps
  let lastFilledIdx = 0;
  while (lastFilledIdx < 8) {
    let nextFilledIdx = -1;
    for (let j = lastFilledIdx + 1; j < 8; j++) {
      if (stageStates[j].isTimestampFilled) {
        nextFilledIdx = j;
        break;
      }
    }

    const startMs = new Date(stageStates[lastFilledIdx].timestamp!).getTime();
    let endMs: number;
    let count: number;

    if (nextFilledIdx !== -1) {
      endMs = new Date(stageStates[nextFilledIdx].timestamp!).getTime();
      count = nextFilledIdx - lastFilledIdx;
      if (endMs <= startMs + count * 30 * 60 * 1000) {
        endMs = startMs + count * 60 * 60 * 1000;
        stageStates[nextFilledIdx].timestamp = new Date(endMs).toISOString();
      }
    } else {
      nextFilledIdx = 8;
      count = 8 - lastFilledIdx;
      endMs = Math.max(defaultEndMs, startMs + count * 2 * 3600 * 1000);
    }

    const unfilledCount = nextFilledIdx - lastFilledIdx - 1;
    if (unfilledCount > 0) {
      const stepMs = (endMs - startMs) / (nextFilledIdx - lastFilledIdx);
      for (let k = lastFilledIdx + 1; k < nextFilledIdx; k++) {
        if (!stageStates[k].isTimestampFilled) {
          const rawMs = startMs + (k - lastFilledIdx) * stepMs;
          const roundedMs = Math.round(rawMs / 60000) * 60000;
          stageStates[k].timestamp = new Date(roundedMs).toISOString();
        }
      }
    }

    lastFilledIdx = nextFilledIdx;
  }

  // Final check to guarantee chronological order without shifting user's manual items unless mathematically required
  for (let i = 1; i < 8; i++) {
    const prevMs = new Date(stageStates[i - 1].timestamp!).getTime();
    const currMs = new Date(stageStates[i].timestamp!).getTime();
    if (isNaN(currMs) || currMs <= prevMs) {
      stageStates[i].timestamp = new Date(prevMs + 30 * 60 * 1000).toISOString();
    }
  }

  return stageStates.map(s => ({
    status_name: s.status_name,
    location: s.location,
    timestamp: s.timestamp!,
    description: s.description
  }));
}

/**
 * Deduplication Cleanup Utility:
 * Enforces exactly ONE array of 8 ordered milestone objects inside the history JSONB payload (Index 0 through 7).
 * Strictly respects user manual inputs, locations, and timings while auto-recalculating any unfilled elements.
 */
export function deduplicateAndEnforce8Stages(
  rawHistory: any[] | undefined | null,
  options: DeduplicationOptions = {}
): ShipmentHistoryItem[] {
  // Use smart recalculation of unfilled milestones to strictly preserve user inputs and timing
  return recalculateUnfilledMilestones(rawHistory, options);
}

/**
 * Manual Stage Override Logic:
 * When an admin manually advances or updates a shipment to a specific stage:
 * 1. Save the EXACT location and timing set by the user for that stage (using sender address only, never sender name).
 * 2. Leave the ones AI calculated as UPCOMING:
 *    - Preserve their AI-calculated locations and descriptions intact.
 *    - If their existing scheduled timestamps are already in the future after the manual update time, keep them!
 *    - Only if an upcoming timestamp is behind the new manual update time, space them smoothly into the future up to estimated delivery date.
 * 3. Never append (.push()); operate strictly within the fixed 8-stage canonical array.
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
    senderAddress?: string | null;
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
    senderAddress: options.senderAddress,
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

  // Derive sender address for clean origin fallback - strictly never sender name
  let originClean = stripSenderName(options.senderAddress || options.origin || '', options.senderName);
  if (!originClean) {
    originClean = 'FedEx Origin Facility';
  }
  const fedExOriginCenter = getFedExOriginShipCenter(originClean, 'FedEx Ship Center');

  const destClean = (options.destination || '').trim() || 'Destination Address';
  const destCity = extractCityOrRegion(destClean, 'Destination Hub');
  const hub = getSmartFedExHub(originClean, destClean, options.serviceType || undefined);
  const canonicalLocations: string[] = [
    fedExOriginCenter,
    fedExOriginCenter,
    hub.hubLocation,
    `FedEx Gateway Transit Corridor (${hub.hubName})`,
    `${destCity} Regional Ramp Terminal`,
    `FedEx Destination Station, ${destCity}`,
    `On Route - ${destCity}`,
    destClean
  ];

  // Step 2: Mark target stage timestamp as manual time set by user (or NOW)
  const manualDate = options.manualTimestamp ? new Date(options.manualTimestamp) : new Date();
  const targetTimeMs = isNaN(manualDate.getTime()) ? Date.now() : manualDate.getTime();
  stages[targetIdx].timestamp = new Date(targetTimeMs).toISOString();

  // Save the location set by the user:
  // - Stages 1 & 2: FedEx Ship Center / location (never sender personal street address or sender name)
  // - Stages 3 to 8: outside transit routes (never sender address or sender name)
  if (options.location && options.location.trim()) {
    const cleanedUserLocation = cleanLocationString(
      options.location,
      options.senderName,
      options.recipientName,
      canonicalLocations[targetIdx],
      originClean,
      targetIdx
    );
    stages[targetIdx].location = cleanedUserLocation;
  } else if (!stages[targetIdx].location || (options.senderName && stages[targetIdx].location.trim().toLowerCase() === options.senderName.trim().toLowerCase())) {
    stages[targetIdx].location = canonicalLocations[targetIdx];
  } else if (targetIdx === 0 || targetIdx === 1) {
    // Ensure stage 1 and 2 use FedEx Ship Center / location
    const sAddrLower = originClean.toLowerCase();
    if (
      stages[targetIdx].location.toLowerCase() === sAddrLower ||
      (sAddrLower.length > 5 && stages[targetIdx].location.toLowerCase().includes(sAddrLower) && !/fedex/i.test(stages[targetIdx].location)) ||
      (/^[0-9]+\s+[A-Za-z]/.test(stages[targetIdx].location) && !/fedex/i.test(stages[targetIdx].location))
    ) {
      stages[targetIdx].location = fedExOriginCenter;
    }
  } else if (targetIdx >= 2) {
    // If target is transit stage, ensure sender address didn't leak
    const sAddrLower = originClean.toLowerCase();
    if (stages[targetIdx].location.toLowerCase() === sAddrLower || (sAddrLower.length > 5 && stages[targetIdx].location.toLowerCase().includes(sAddrLower))) {
      stages[targetIdx].location = canonicalLocations[targetIdx];
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
      priorStepBackMs = priorStepBackMs - 30 * 60 * 1000;
      stages[i].timestamp = new Date(priorStepBackMs).toISOString();
    } else {
      priorStepBackMs = existingMs;
    }
  }

  // Step 4: Upcoming stages (targetIdx + 1 to 7)
  // User directive: "still leave the ones ai calculated as upcoming"
  // Keep their AI-calculated locations and descriptions intact as upcoming!
  // Check if existing upcoming timestamps are already chronological and in the future relative to targetTimeMs
  const subsequentCount = 7 - targetIdx;
  if (subsequentCount > 0) {
    let areUpcomingChronological = true;
    let prevUpcomingMs = targetTimeMs;
    for (let i = targetIdx + 1; i <= 7; i++) {
      const t = new Date(stages[i].timestamp).getTime();
      if (isNaN(t) || t <= prevUpcomingMs) {
        areUpcomingChronological = false;
        break;
      }
      prevUpcomingMs = t;
    }

    // Only if an upcoming stage timestamp fell behind the new manual timestamp,
    // recalculate future dates so they sit in the FUTURE starting from targetTimeMs up to estimated_delivery_date,
    // while keeping all AI-calculated locations and descriptions completely intact!
    if (!areUpcomingChronological) {
      let endMs: number;
      if (options.estimatedDeliveryDate) {
        const raw = options.estimatedDeliveryDate.toString().trim();
        const parsedEnd = raw.includes('T') ? new Date(raw) : new Date(`${raw}T17:00:00`);
        if (!isNaN(parsedEnd.getTime()) && parsedEnd.getTime() > targetTimeMs + subsequentCount * 30 * 60 * 1000) {
          endMs = parsedEnd.getTime();
        } else {
          endMs = targetTimeMs + Math.max(subsequentCount * 8 * 3600 * 1000, 24 * 3600 * 1000);
        }
      } else {
        endMs = targetTimeMs + Math.max(subsequentCount * 8 * 3600 * 1000, 48 * 3600 * 1000);
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
  const originClean = stripSenderName(options.senderAddress?.trim() || options.origin?.trim() || '', options.senderName) || 'FedEx Origin Facility';
  const destClean = options.destination?.trim() || 'Destination Location';

  const destCity = extractCityOrRegion(destClean, 'Destination Hub');
  const hub = getSmartFedExHub(originClean, destClean, options.serviceType);
  const fedExOriginCenter = getFedExOriginShipCenter(originClean, 'FedEx Ship Center');

  // Strict location mapping adhering to user directive:
  // - Stages 1 & 2: FedEx Ship Center / location near origin city (never sender street address)
  // - Stages 3 to 6: transit hub names / corridors
  // - Stage 7: courier delivery route in destination city
  // - Stage 8: recipient destination address
  const stageLocations: string[] = [
    fedExOriginCenter,
    fedExOriginCenter,
    hub.hubLocation,
    `FedEx Gateway Transit Corridor (${hub.hubName})`,
    `${destCity} Regional Ramp Terminal`,
    `FedEx Destination Station, ${destCity}`,
    `On Route - ${destCity}`,
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
    const location = stageLocations[index] || fedExOriginCenter;
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
        origin: options.origin,
        senderAddress: options.senderAddress,
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
          origin: options.origin,
          senderAddress: options.senderAddress,
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
