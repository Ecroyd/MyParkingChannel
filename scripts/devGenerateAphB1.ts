/**
 * Development test harness for APH B.1 CSV generation
 * 
 * Usage: npx tsx scripts/devGenerateAphB1.ts
 */

import { generateAphB1RatesCsv } from '../src/lib/integrations/aph/csv';
import type { PricingEngine, AphProductMapping, AphChannelConfig } from '../src/lib/integrations/aph/types';

/**
 * Mock pricing engine that returns deterministic prices for testing
 */
const mockPricingEngine: PricingEngine = {
  async getPrice({ lengthOfStay }) {
    // Simple deterministic pricing: 10 + lengthOfStay
    // For testing, we'll make some dates closeouts
    const basePrice = 10 + lengthOfStay;
    
    // Simulate closeout for certain LOS values (e.g., LOS > 20)
    if (lengthOfStay > 20) {
      return {
        totalPrice: null,
        isCloseout: true,
      };
    }

    return {
      totalPrice: basePrice,
      isCloseout: false,
    };
  },
};

async function main() {
  console.log('🧪 Testing APH B.1 CSV generation...\n');

  const tenantId = 'test-tenant-id';
  
  const config: AphChannelConfig = {
    format: 'B1',
    supplierCode: 'TEST',
    daysAhead: 3,
    // validFromDate is optional - will use today if not provided
  };

  const products: AphProductMapping[] = [
    {
      productCode: '001',
      internalProductId: 'product-1',
    },
    {
      productCode: '002',
      internalProductId: 'product-2',
    },
  ];

  try {
    const result = await generateAphB1RatesCsv({
      tenantId,
      config,
      products,
      pricingEngine: mockPricingEngine,
    });

    console.log('✅ CSV generation successful!\n');
    console.log('📄 Filename:', result.filename);
    console.log('📊 Rows count:', result.rowsCount);
    console.log('\n📝 First 20 lines of CSV:');
    console.log('─'.repeat(60));

    const lines = result.csv.split('\n');
    const previewLines = lines.slice(0, 20);
    console.log(previewLines.join('\n'));

    if (lines.length > 20) {
      console.log(`\n... (${lines.length - 20} more lines)`);
    }

    console.log('\n✅ Test completed successfully!');
  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { mockPricingEngine };

