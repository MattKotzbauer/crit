/**
 * Deliverables System
 *
 * Tracks features/outcomes rather than tasks. A deliverable is something
 * the user can point to and say "this works now".
 *
 * Examples:
 * - "Shopping cart adds items correctly"
 * - "User can log in with email"
 * - "AI chat responds to product questions"
 */

export type DeliverableStatus =
  | 'working'      // Verified working
  | 'partial'      // Some functionality works
  | 'broken'       // Was working, now broken
  | 'untested'     // Built but not verified
  | 'planned';     // Defined but not built

export interface Deliverable {
  id: string;
  name: string;              // Short name: "Shopping Cart"
  description: string;       // What it does: "Users can add/remove items, see total"
  status: DeliverableStatus;

  // Code references
  files: string[];           // Main files implementing this
  entryPoint?: string;       // Where to start reading: "src/lib/cart/index.ts"

  // Verification
  testFile?: string;         // Test that verifies this works
  lastVerified?: string;     // ISO date of last verification
  verificationMethod?: string; // "bun test cart" or "manual: add item to cart"

  // Dependencies
  dependsOn?: string[];      // Other deliverable IDs this needs

  // History
  createdAt: string;
  updatedAt: string;
  changelog?: {
    date: string;
    change: string;
  }[];
}

export interface DeliverableGroup {
  name: string;              // "User Authentication", "E-commerce", "AI Features"
  deliverables: string[];    // Deliverable IDs
}

export interface DeliverableState {
  deliverables: Deliverable[];
  groups: DeliverableGroup[];
}

// For displaying to user
export interface DeliverableSummary {
  total: number;
  working: number;
  partial: number;
  broken: number;
  untested: number;
  planned: number;
  byGroup: {
    name: string;
    working: number;
    total: number;
  }[];
}
