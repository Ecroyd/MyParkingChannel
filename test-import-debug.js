// Quick test script to debug the import issue
const testRow = {
  'Booking ID': 'BK001',
  'Reference': 'REF001',
  'Customer Name': 'John Smith',
  'Email': 'john@example.com',
  'Phone': '07123456789',
  'Vehicle Registration': 'ABC123',
  'Car Make': 'Ford',
  'Car Model': 'Focus',
  'Car Color': 'Blue',
  'Flight Number': 'BA123',
  'Arrival Date': '01/01/2024',
  'Arrival Time': '10:00',
  'Departure Date': '05/01/2024',
  'Departure Time': '14:00',
  'Status': 'Confirmed',
  'Money Received': '£45.00',
  'Money Charged': '£50.00',
  'Source': 'Website',
  'Created Date': '01/01/2024'
}

console.log('Test row:', testRow)

// Test the CSV normalizer
async function testCSVNormalizer() {
  try {
    const response = await fetch('http://localhost:3002/api/debug/csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ testRow })
    })
    
    const result = await response.json()
    console.log('CSV Normalizer Result:', result)
  } catch (error) {
    console.error('CSV Normalizer Error:', error)
  }
}

// Test the import debug
async function testImportDebug() {
  try {
    const response = await fetch('http://localhost:3002/api/debug/import')
    const result = await response.json()
    console.log('Import Debug Result:', result)
  } catch (error) {
    console.error('Import Debug Error:', error)
  }
}

// Run tests
testCSVNormalizer()
testImportDebug()
