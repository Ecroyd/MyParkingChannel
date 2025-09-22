// Run this in your browser console to clear all cookies
console.log('Clearing all cookies...')

// Clear all cookies
document.cookie.split(";").forEach(function(c) { 
  document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
});

// Clear localStorage and sessionStorage
localStorage.clear();
sessionStorage.clear();

console.log('All cookies, localStorage, and sessionStorage cleared!')
console.log('Please refresh the page and try logging in again.')
