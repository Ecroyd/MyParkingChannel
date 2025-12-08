// Types for APH SFTP integration

export type AphFormat = 'B1';

export interface AphChannelConfig {
  format: AphFormat;              // currently only 'B1'
  supplierCode: string;           // APH "Product / CPC" code prefix or mapping key
  daysAhead: number;              // how many days from today to generate
  validFromDate?: string;         // optional override in YYYY-MM-DD, else use today
}

export interface AphProductMapping {
  productCode: string;            // APH Product code for this product (3 digits or similar)
  internalProductId: string;      // our internal product identifier
}

export interface AphRatesCsvResult {
  filename: string;
  csv: string;
  rowsCount: number;
}

/**
 * Pricing engine interface for APH CSV generation
 * This is a pure interface that can be implemented by adapters
 */
export interface PricingEngine {
  getPrice(params: {
    tenantId: string;
    internalProductId: string;
    arrivalDate: Date;
    lengthOfStay: number;
  }): Promise<{
    totalPrice: number | null;    // null if no price / closeout
    isCloseout?: boolean;         // true if this date/LOS should be closed
  }>;
}

// Legacy types for backward compatibility with existing code
export interface AphConfig {
  format: AphFormat;
  supplier_code: string;
  send_frequency_minutes: number;
  days_ahead: number;
}

export interface AphSftpCredentials {
  host: string;
  port: number;
  username: string;
  password?: string;   // optional, in case we switch to key auth later
  remotePath: string;  // e.g. "/incoming/rates/SUPPLIER/"
}

// Legacy alias for backward compatibility
export interface AphSftpCredentialsLegacy {
  host: string;
  port: number;
  username: string;
  password: string;
  remote_path: string;
}

