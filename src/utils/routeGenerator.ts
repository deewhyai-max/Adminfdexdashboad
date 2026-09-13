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
  let start = now;
  if (startTime) {
    const parsedStart = startTime instanceof Date ? startTime : new Date(startTime);
    if (!isNaN(parsedStart.getTime())) {
      // Allow recent start time within 10 minutes of now, but clamp to now if older
      if (parsedStart.getTime() >= now.getTime() - 10 * 60 * 1000) {
        start = parsedStart;
      }
    }
  }

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
        // Standard FedEx end-of-day target time 17:00:00 (5:00 PM) on delivery day
        end = new Date(`${raw}T17:00:00`);
      }
    } else {
      end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
    }
  } else {
    end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
  }

  // Guard: if end is invalid or less than 3 hours into the future, fallback to 72 hours from start
  if (isNaN(end.getTime()) || end.getTime() <= start.getTime() + 3 * 3600 * 1000) {
    end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
  }

  // Rule 2: Evenly divide total duration across Stages 2 through 7 (7 total intervals from 1 to 8)
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

// Local synchronous fallback generator
export function generate8StageRoute(options: RouteGeneratorOptions): GeneratedRoutePlan {
  const originClean = options.origin?.trim() || options.senderAddress?.trim() || 'Origin Location';
  const destClean = options.destination?.trim() || 'Destination Location';

  const originCity = extractCityOrRegion(originClean, 'Origin Facility');
  const destCity = extractCityOrRegion(destClean, 'Destination Hub');
  const hub = getSmartFedExHub(originClean, destClean, options.serviceType);

  const stageLocations: string[] = [
    originClean,
    `${originCity} FedEx Ship Center`,
    hub.hubLocation,
    `FedEx Gateway Transit Corridor (En Route)`,
    `${destCity} Regional Ramp Terminal`,
    `At Local FedEx Facility - ${destCity}`,
    `Local Courier Route - ${destCity}`,
    destClean
  ];

  const stageDescriptions: string[] = [
    'Shipping label has been created. Package awaiting origin carrier pickup.',
    `Picked up by FedEx. Scanned at ${originCity} origin station.`,
    `Arrived at ${hub.hubName}. Automated optical sort scanning in progress.`,
    `Departed ${hub.hubName} via FedEx Express flight leg to destination gateway.`,
    `Flight arrived at ${destCity} regional air ramp. Inbound sort scan complete.`,
    `Package arrived at local delivery station in ${destCity}. Staged for courier dispatch.`,
    `On FedEx delivery vehicle for final delivery. Courier route active.`,
    `Delivered. Package securely delivered to ${options.recipientName || 'destination'}.`
  ];

  const history: ShipmentHistoryItem[] = [];
  const route_waypoints: RouteWaypoint[] = [];

  const stageTimestamps = calculate8StageSpacedTimestamps(options.startTime, options.estimatedDeliveryDate);

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
      if (data.history && data.route_waypoints && data.history.length === 8) {
        // Enforce exact Fixed Timestamp Spacing Rules across all 8 stages
        const guaranteedTimestamps = calculate8StageSpacedTimestamps(options.startTime, options.estimatedDeliveryDate);
        const alignedHistory = data.history.map((h: any, idx: number) => ({
          ...h,
          timestamp: guaranteedTimestamps[idx]
        }));
        const alignedWaypoints = data.route_waypoints.map((w: any, idx: number) => ({
          ...w,
          estimated_time: guaranteedTimestamps[idx]
        }));
        return {
          history: alignedHistory,
          route_waypoints: alignedWaypoints,
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
