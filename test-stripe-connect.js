// test-stripe-connect.js
// Quick test script to verify Stripe Connect setup
// Run with: node test-stripe-connect.js

const https = require('https');

const BASE_URL = process.env.NEXT_PUBLIC_ROOT_URL || 'http://localhost:3000';

async function testEndpoint(endpoint, method = 'GET') {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Testing Stripe Connect Setup...\n');

  // Test 1: Environment validation
  console.log('1. Checking environment variables...');
  try {
    const envTest = await testEndpoint('/api/stripe/validate-env');
    console.log('   Status:', envTest.status);
    console.log('   Message:', envTest.data.message);
    if (envTest.data.status !== 'ready') {
      console.log('   ❌ Environment not ready');
      return;
    }
    console.log('   ✅ Environment ready\n');
  } catch (error) {
    console.log('   ❌ Failed to check environment:', error.message);
    return;
  }

  // Test 2: Create account
  console.log('2. Testing account creation...');
  try {
    const createTest = await testEndpoint('/api/stripe/accounts/create', 'POST');
    if (createTest.status === 200 && createTest.data.accountId) {
      console.log('   ✅ Account created:', createTest.data.accountId);
      
      // Test 3: Check account status
      console.log('3. Testing account status...');
      const statusTest = await testEndpoint(`/api/stripe/accounts/${createTest.data.accountId}/status`);
      if (statusTest.status === 200) {
        console.log('   ✅ Account status retrieved');
        console.log('   Charges enabled:', statusTest.data.charges_enabled);
        console.log('   Payouts enabled:', statusTest.data.payouts_enabled);
      } else {
        console.log('   ❌ Failed to get account status');
      }
    } else {
      console.log('   ❌ Failed to create account');
    }
  } catch (error) {
    console.log('   ❌ Account creation failed:', error.message);
  }

  console.log('\n🎉 Test complete!');
  console.log('\nNext steps:');
  console.log('1. Visit /admin/connect to create and onboard an account');
  console.log('2. Complete the Stripe onboarding flow');
  console.log('3. Create products and test the storefront');
}

runTests().catch(console.error);
