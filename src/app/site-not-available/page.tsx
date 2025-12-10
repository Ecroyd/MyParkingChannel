// src/app/site-not-available/page.tsx

export default function SiteNotAvailablePage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="max-w-md w-full bg-white shadow-md rounded-xl p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold">
          Site not available
        </h1>
        <p className="text-slate-600">
          This parking site isn&apos;t currently configured correctly.
          Please contact your parking provider or MyParkingChannel support.
        </p>
      </div>
    </main>
  );
}

