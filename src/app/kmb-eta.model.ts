export interface KmbEtaResponse {
  type: string;
  version: string;
  generated_timestamp: string;
  data: KmbEtaItem[];
}

export interface KmbEtaItem {
  co: string; // Company code (e.g., KMB)
  route: string; // Bus Route Number
  dir: string; // Direction (O: Outbound, I: Inbound)
  service_type: number; // Service Type
  seq: number; // Stop Sequence
  dest_tc: string; // Destination (Traditional Chinese)
  dest_sc: string; // Destination (Simplified Chinese)
  dest_en: string; // Destination (English)
  eta: string; // Estimated Time of Arrival (ISO 8601)
  rmk_tc: string; // Remark (TC)
  rmk_sc: string; // Remark (SC)
  rmk_en: string; // Remark (English)
  data_timestamp: string;
}
