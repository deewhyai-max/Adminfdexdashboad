/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ShipmentStatus = 
  | 'Shipping label created'
  | 'Package received by FedEx'
  | 'In Transit'
  | 'On the way'
  | 'Out for Delivery'
  | 'Arriving at destination facility'
  | 'On Hold'
  | 'Delivered'
  | 'Pending'
  | 'Exception';

export interface ShipmentHistoryItem {
  timestamp: string;
  status_name: ShipmentStatus;
  location: string;
  description: string;
}

export interface Shipment {
  id: string; // Tracking ID
  user_id: string; // Owner ID
  recipient_name: string;
  destination_address?: string;
  origin_city_state?: string;
  asset_value: number;
  service_fee: number;
  estimated_delivery_date?: string;
  status: ShipmentStatus;
  created_at: string;
  history: ShipmentHistoryItem[];
}

export interface User {
  id: string;
  pin: string;
}

export interface AppState {
  isUnlocked: boolean;
  shipments: Shipment[];
}
