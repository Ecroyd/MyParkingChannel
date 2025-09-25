import OrphansClient from '../OrphansClient';

export default function OrphansPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Orphan Tenants</h1>
        <p className="text-gray-600 mt-1">
          Tenants without any assigned members. These need owners to be functional.
        </p>
      </div>
      <OrphansClient />
    </div>
  );
}
