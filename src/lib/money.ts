export const toMoney = (cents: number, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format((cents || 0) / 100);
