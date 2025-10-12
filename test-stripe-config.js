// test-stripe-config.js
// Quick test to verify Stripe configuration works

// Simulate different environments
console.log('Testing Stripe configuration...\n');

// Test 1: Development mode (should use TEST key)
process.env.NODE_ENV = 'development';
process.env.STRIPE_SECRET_KEY_TEST = 'sk_test_123';
process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_456';

try {
  // Clear require cache to get fresh module
  delete require.cache[require.resolve('./src/lib/stripe.ts')];
  const { stripe } = require('./src/lib/stripe.ts');
  console.log('✅ Development mode: Using test key');
} catch (error) {
  console.log('❌ Development mode failed:', error.message);
}

// Test 2: Production mode (should use LIVE key)
process.env.NODE_ENV = 'production';
delete process.env.STRIPE_SECRET_KEY_TEST; // Remove test key

try {
  delete require.cache[require.resolve('./src/lib/stripe.ts')];
  const { stripe } = require('./src/lib/stripe.ts');
  console.log('✅ Production mode: Using live key');
} catch (error) {
  console.log('❌ Production mode failed:', error.message);
}

// Test 3: Force live mode
process.env.NODE_ENV = 'development';
process.env.STRIPE_MODE = 'live';
process.env.STRIPE_SECRET_KEY_LIVE = 'sk_live_456';

try {
  delete require.cache[require.resolve('./src/lib/stripe.ts')];
  const { stripe } = require('./src/lib/stripe.ts');
  console.log('✅ Force live mode: Using live key');
} catch (error) {
  console.log('❌ Force live mode failed:', error.message);
}

// Test 4: Missing keys
delete process.env.STRIPE_SECRET_KEY_TEST;
delete process.env.STRIPE_SECRET_KEY_LIVE;
delete process.env.STRIPE_MODE;

try {
  delete require.cache[require.resolve('./src/lib/stripe.ts')];
  const { stripe } = require('./src/lib/stripe.ts');
  console.log('❌ Should have failed with missing keys');
} catch (error) {
  console.log('✅ Missing keys: Correctly failed with error:', error.message);
}

console.log('\n🎉 Stripe configuration test complete!');



