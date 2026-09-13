import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const PORT = 3000;
const app = express();

app.use(express.json({ limit: "10mb" }));

// Helper to extract city/region for fallback logic
function extractCityOrRegion(address: string | undefined | null, fallback: string): string {
  if (!address || !address.trim()) return fallback;
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts.slice(1, 3).join(', ');
  }
  return parts[0] || fallback;
}

// Select realistic FedEx hub based on origin and destination context
function determineFedExHub(origin: string, destination: string, serviceType: string): { hubName: string; location: string } {
  const text = `${origin} ${destination} ${serviceType}`.toLowerCase();
  
  if (text.includes('japan') || text.includes('tokyo') || text.includes('china') || text.includes('asia') || text.includes('singapore') || text.includes('hong kong')) {
    return { hubName: "FedEx Asia-Pacific SuperHub (CAN)", location: "Guangzhou Baiyun Airport Hub, China" };
  }
  if (text.includes('france') || text.includes('paris') || text.includes('germany') || text.includes('europe') || text.includes('uk') || text.includes('london') || text.includes('netherlands') || text.includes('spain') || text.includes('italy')) {
    return { hubName: "FedEx European Hub (CDG)", location: "Roissy-Charles de Gaulle Airport, France" };
  }
  if (text.includes('dubai') || text.includes('uae') || text.includes('india') || text.includes('middle east')) {
    return { hubName: "FedEx Middle East Hub (DXB)", location: "Dubai South Aviation City, UAE" };
  }
  if (text.includes('ground')) {
    return { hubName: "FedEx Ground Multi-Regional Hub", location: "Kansas City Ground Interchange, MO" };
  }
  if (text.includes('west') || text.includes('california') || text.includes('seattle') || text.includes('san francisco') || text.includes('los angeles')) {
    return { hubName: "FedEx West Coast Hub (OAK)", location: "Oakland International Airport Hub, CA" };
  }
  if (text.includes('new york') || text.includes('boston') || text.includes('philadelphia') || text.includes('east')) {
    return { hubName: "FedEx Mid-Atlantic & Northeast Hub (EWR)", location: "Newark Liberty Airport Ramp, NJ" };
  }
  // Default to the flagship FedEx World Hub
  return { hubName: "FedEx World Hub (SuperHub)", location: "Memphis SuperHub (KMEM), TN" };
}

// Algorithmic Fallback Generator ensuring 100% reliability
function generateAlgorithmicFedExRoute(params: {
  origin: string;
  destination: string;
  serviceType: string;
  startTime?: string;
  estimatedDeliveryDate?: string;
  recipientName?: string;
}) {
  const originClean = params.origin?.trim() || "Origin Station";
  const destClean = params.destination?.trim() || "Destination Address";
  const originCity = extractCityOrRegion(originClean, "Origin Facility");
  const destCity = extractCityOrRegion(destClean, "Destination Facility");

  let start = params.startTime ? new Date(params.startTime) : new Date();
  if (isNaN(start.getTime())) start = new Date();

  let end: Date;
  if (params.estimatedDeliveryDate && params.estimatedDeliveryDate.trim()) {
    const rawDelivery = params.estimatedDeliveryDate.trim();
    if (rawDelivery.includes('T')) {
      end = new Date(rawDelivery);
    } else {
      end = new Date(`${rawDelivery}T13:45:00`);
    }
  } else {
    end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
  }

  if (isNaN(end.getTime()) || end.getTime() <= start.getTime() + 3600000) {
    end = new Date(start.getTime() + 72 * 60 * 60 * 1000);
  }

  const totalDuration = end.getTime() - start.getTime();
  const stageRatios = [0.0, 0.08, 0.28, 0.50, 0.72, 0.85, 0.93, 1.0];
  const fedExHub = determineFedExHub(originClean, destClean, params.serviceType || "");

  const stageData = [
    {
      stage: 1,
      status: "Shipping label created",
      location: originClean,
      desc: "Shipping label has been created. The package has not yet been handed to FedEx."
    },
    {
      stage: 2,
      status: "Package received by FedEx",
      location: `${originCity} FedEx Ship Center`,
      desc: "Picked up by FedEx. Scanned and verified at origin station."
    },
    {
      stage: 3,
      status: "In Transit",
      location: fedExHub.location,
      desc: `Arrived at ${fedExHub.hubName}. Automated high-speed conveyor sorting in progress.`
    },
    {
      stage: 4,
      status: "On the way",
      location: `FedEx Gateway Flight Corridor (In Transit)`,
      desc: `Departed ${fedExHub.hubName} via FedEx Express transport to destination gateway.`
    },
    {
      stage: 5,
      status: "Arriving at destination facility",
      location: `${destCity} Regional Ramp Terminal`,
      desc: "Flight arrived at destination regional air gateway. Unloaded and staged for local transfer."
    },
    {
      stage: 6,
      status: "At local FedEx facility",
      location: `At local FedEx facility - ${destCity}`,
      desc: "Package sorted at destination delivery station. Scanned to courier dispatch staging bin."
    },
    {
      stage: 7,
      status: "Out for Delivery",
      location: `Local Delivery Route - ${destCity}`,
      desc: "On FedEx vehicle for delivery. Final courier run initiated."
    },
    {
      stage: 8,
      status: "Delivered",
      location: destClean,
      desc: `Delivered. Package safely released to ${params.recipientName || 'recipient'}.`
    }
  ];

  let lastTimestamp = start.getTime();
  const history = stageData.map((item, index) => {
    let stageMs = start.getTime() + totalDuration * stageRatios[index];
    if (index > 0 && stageMs <= lastTimestamp) {
      stageMs = lastTimestamp + 30 * 60 * 1000;
    }
    lastTimestamp = stageMs;
    const timeStr = new Date(stageMs).toISOString();
    return {
      status_name: item.status,
      location: item.location,
      timestamp: timeStr,
      description: item.desc
    };
  });

  const route_waypoints = stageData.map((item, index) => ({
    stage: item.stage,
    stage_name: item.status,
    location: history[index].location,
    estimated_time: history[index].timestamp,
    description: history[index].description
  }));

  return {
    history,
    route_waypoints,
    ai_generated: false,
    hub_name: fedExHub.hubName
  };
}

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "FedEx Global Control Tower" });
});

// Dedicated AI-Powered FedEx Route Calculation Endpoint
app.post("/api/fedex/calculate-route", async (req, res) => {
  const {
    origin,
    destination,
    serviceType = "FedEx Priority Overnight",
    packageType = "FedEx Box",
    weight,
    weightUnit = "lbs",
    recipientName = "Recipient",
    senderName,
    startTime,
    estimatedDeliveryDate,
    isDryIce,
    isHazardous,
    isSaturdayDelivery
  } = req.body || {};

  const originClean = origin?.trim() || "Dallas, TX";
  const destClean = destination?.trim() || "Frankfurt, Germany";

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is not set. Executing high-fidelity algorithmic route generator.");
    const fallbackPlan = generateAlgorithmicFedExRoute({
      origin: originClean,
      destination: destClean,
      serviceType,
      startTime,
      estimatedDeliveryDate,
      recipientName
    });
    return res.json({
      success: true,
      ai_generated: false,
      note: "Calculated with FedEx Global Hub Routing Network (algorithmic engine).",
      ...fallbackPlan
    });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    const prompt = `You are the FedEx Master Logistics Routing AI. Calculate an authentic, realistic 8-stage FedEx shipment routing plan with exact FedEx hubs, facilities, waypoints, and scan descriptions tailored to this shipment:

Shipment Specifications:
- Origin: "${originClean}"
- Destination: "${destClean}"
- FedEx Service Type: "${serviceType}"
- Package: ${packageType} (${weight ? `${weight} ${weightUnit}` : 'Standard weight'})
- Special Flags: ${isDryIce ? 'Dry Ice Included, ' : ''}${isHazardous ? 'Hazardous Materials, ' : ''}${isSaturdayDelivery ? 'Saturday Delivery Requested, ' : ''}Standard Handling
- Starting / Entry Time: "${startTime || new Date().toISOString()}"
- Target Estimated Delivery Date: "${estimatedDeliveryDate || 'Within 2-3 business days'}"
- Recipient: "${recipientName}"

Logistical Routing Rules:
1. Exact 8 sequential FedEx stages MUST be followed:
   Stage 1: "Shipping label created"
   Stage 2: "Package received by FedEx"
   Stage 3: "In Transit"
   Stage 4: "On the way"
   Stage 5: "Arriving at destination facility"
   Stage 6: "At local FedEx facility"
   Stage 7: "Out for Delivery"
   Stage 8: "Delivered"

2. Hub selection: Choose the authentic, geographically sound FedEx hub for this route:
   - US Domestic Express: Memphis World Hub (KMEM) or Indianapolis National Hub (IND) or Newark (EWR) / Oakland (OAK) / Fort Worth (AFW).
   - US Ground: Realistic regional FedEx Ground trucking hubs.
   - Europe / Transatlantic: Paris Charles de Gaulle Hub (CDG) or Cologne/Bonn or London Stansted (STN).
   - Asia / Transpacific: Guangzhou Baiyun Hub (CAN) or Narita (NRT).
   - Middle East / Africa / India: Dubai World Central / DXB Gateway.

3. Location formatting: Include realistic FedEx facility names, e.g.:
   - "FedEx Ship Center - [City, State/Country]"
   - "[Specific FedEx Hub Name], [State/Country]"
   - "Regional Air Ramp - [Airport/City]"
   - "At local FedEx facility - [City, State/Country]"
   - "Destination Delivery Station - [City, State/Country]"

4. Timestamps: Generate chronologically sequential, realistic ISO 8601 timestamps progressing smoothly from start time to the delivery target. Ensure each stage is strictly later than the prior stage.

5. Descriptions: Write authentic FedEx tracking scan messages (e.g. "Shipping label created. Package awaiting carrier pickup", "Picked up by FedEx. Origin scan complete", "Arrived at FedEx World Hub. Package sorted through automated optical scanners", "Departed FedEx location on flight FX...", "At destination sort facility. Package sorted to local courier delivery van", "On FedEx vehicle for delivery", "Delivered. Left at recipient address").`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            primary_hub: {
              type: Type.STRING,
              description: "The primary FedEx hub or sorting facility chosen for this transit route"
            },
            routing_summary: {
              type: Type.STRING,
              description: "A 1-sentence technical routing explanation of the logistics route"
            },
            stages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  stage: { type: Type.INTEGER },
                  status_name: { type: Type.STRING },
                  location: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["stage", "status_name", "location", "timestamp", "description"]
              }
            }
          },
          required: ["stages", "primary_hub"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");

    if (parsed.stages && Array.isArray(parsed.stages) && parsed.stages.length === 8) {
      // Validate chronological order
      let lastTime = new Date(startTime || Date.now()).getTime();
      const sanitizedHistory = parsed.stages.map((s: any, idx: number) => {
        let t = new Date(s.timestamp).getTime();
        if (isNaN(t) || (idx > 0 && t <= lastTime)) {
          t = lastTime + 2 * 60 * 60 * 1000;
        }
        lastTime = t;
        const validTime = new Date(t).toISOString();
        return {
          status_name: s.status_name,
          location: s.location,
          timestamp: validTime,
          description: s.description
        };
      });

      const sanitizedWaypoints = parsed.stages.map((s: any, idx: number) => ({
        stage: s.stage || (idx + 1),
        stage_name: s.status_name,
        location: sanitizedHistory[idx].location,
        estimated_time: sanitizedHistory[idx].timestamp,
        description: sanitizedHistory[idx].description
      }));

      return res.json({
        success: true,
        ai_generated: true,
        hub_name: parsed.primary_hub,
        routing_summary: parsed.routing_summary,
        history: sanitizedHistory,
        route_waypoints: sanitizedWaypoints
      });
    }

    // If parsing returned unexpected stage count, use fallback
    const fallbackPlan = generateAlgorithmicFedExRoute({
      origin: originClean,
      destination: destClean,
      serviceType,
      startTime,
      estimatedDeliveryDate,
      recipientName
    });
    return res.json({
      success: true,
      ai_generated: false,
      note: "Calculated via FedEx Global Hub Routing Network fallback.",
      ...fallbackPlan
    });
  } catch (aiError: any) {
    console.error("Gemini AI Route Calculation Error:", aiError);
    const fallbackPlan = generateAlgorithmicFedExRoute({
      origin: originClean,
      destination: destClean,
      serviceType,
      startTime,
      estimatedDeliveryDate,
      recipientName
    });
    return res.json({
      success: true,
      ai_generated: false,
      note: "Calculated via FedEx Logistics Routing fallback.",
      ...fallbackPlan
    });
  }
});

// Vite Middleware Setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FedEx Global Control Tower running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
