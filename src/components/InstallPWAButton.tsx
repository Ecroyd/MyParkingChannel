'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Smartphone, Share2 } from 'lucide-react';

const InstallPWAButton = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallButton, setShowInstallButton] = useState(false);
  const [showIOSInstall, setShowIOSInstall] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if already installed
    setIsStandalone(window.matchMedia('(display-mode: standalone)').matches);
    
    // Check if iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(iOS);

    // Listen for beforeinstallprompt event (Android/Chrome)
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallButton(true);
    };

    // Listen for appinstalled event
    const handleAppInstalled = () => {
      setShowInstallButton(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    
    setDeferredPrompt(null);
    setShowInstallButton(false);
  };

  const handleIOSInstall = () => {
    setShowIOSInstall(true);
  };

  const closeIOSInstall = () => {
    setShowIOSInstall(false);
  };

  // Don't show if already installed or not supported
  if (isStandalone || (!showInstallButton && !isIOS)) {
    return null;
  }

  return (
    <>
      {/* Install Button */}
      {showInstallButton && (
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={handleInstallClick}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-sky-600 text-white rounded-xl shadow-lg hover:bg-sky-700 transition-colors"
        >
          <Download className="w-5 h-5" />
          <span className="font-medium">Install App</span>
        </motion.button>
      )}

      {/* iOS Install Guide */}
      {isIOS && !isStandalone && (
        <motion.button
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          onClick={handleIOSInstall}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-4 py-3 bg-sky-600 text-white rounded-xl shadow-lg hover:bg-sky-700 transition-colors"
        >
          <Share2 className="w-5 h-5" />
          <span className="font-medium">Add to Home Screen</span>
        </motion.button>
      )}

      {/* iOS Install Modal */}
      <AnimatePresence>
        {showIOSInstall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={closeIOSInstall}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Add to Home Screen</h3>
                <button
                  onClick={closeIOSInstall}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Smartphone className="w-8 h-8 text-sky-600" />
                  <div>
                    <p className="font-medium text-slate-900">Step 1</p>
                    <p className="text-sm text-slate-600">Tap the Share button in Safari</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Share2 className="w-8 h-8 text-sky-600" />
                  <div>
                    <p className="font-medium text-slate-900">Step 2</p>
                    <p className="text-sm text-slate-600">Scroll down and tap "Add to Home Screen"</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                  <Download className="w-8 h-8 text-sky-600" />
                  <div>
                    <p className="font-medium text-slate-900">Step 3</p>
                    <p className="text-sm text-slate-600">Tap "Add" to install the app</p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200">
                <p className="text-sm text-slate-600 text-center">
                  The app will appear on your home screen and launch in full-screen mode.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default InstallPWAButton;
