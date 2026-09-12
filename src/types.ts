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
  sender_name?: string | null;
  sender_address?: string | null;
  currency?: string | null;
  asset_value: number;
  service_fee: number;
  estimated_delivery_date?: string;
  status: ShipmentStatus;
  created_at: string;
  history: ShipmentHistoryItem[];
  package_type?: string | null;
  weight?: number | null;
  weight_unit?: string | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  dimension_unit?: string | null;
  num_packages?: number | null;
  declared_value?: number | null;
  is_dry_ice?: boolean | null;
  is_hazardous?: boolean | null;
  is_saturday_delivery?: boolean | null;
  signature_option?: string | null;
  is_hold_at_location?: boolean | null;
  service_type?: string | null;
}

export interface User {
  id: string;
  pin: string;
}

export interface AppState {
  isUnlocked: boolean;
  shipments: Shipment[];
}
