'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
// Removed broken api import - using direct fetch instead

type Tenant = { id: string; name: string };

type BookingMapping = {
  reference: string | null;
  plate: string | null;
  start_at: string | null;
  end_at: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  money_received?: string | null;
  money_charged?: string | null;
  source?: string | null;
  flight_number?: string | null;
};

type SavedMapping = {
  id: string;
  name: string;
  mapping: BookingMapping;
  created_at: string;
};

type MappingSuggestion = {
  mapping: BookingMapping;
  confidence: number;
  name: string;
  match: 'exact' | 'fuzzy';
  id: string;
};

type InspectResult = {
  fileId: string;
  headers: string[];
  sampleRows: any[];
  totalRows: number;
  signature: string;
  autoGuess: {
    signature: string;
    suggested: MappingSuggestion | null;
  };
  savedMappings: SavedMapping[];
  requiredFields: string[];
  optionalFields: string[];
};

export default function UploadPage() {
  const [step, setStep] = useState<'upload' | 'map' | 'results'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [mapping, setMapping] = useState<BookingMapping>({
    reference: null,
    plate: null,
    start_at: null,
    end_at: null,
  });
  const [saveMapping, setSaveMapping] = useState(false);
  const [mappingName, setMappingName] = useState('');
  const [suggestedMappingId, setSuggestedMappingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/tenants/my", { cache: "no-store", credentials: "include" });
      const j = await r.json();
      setTenants(j.tenants || []);
      setTenantId(j.activeTenantId || "");
    })();
  }, []);

  // Auto-map CSV headers to booking fields
  const autoMapHeaders = (headers: string[]) => {
    const mapping: Partial<BookingMapping> = {};
    
    const headerMap: Record<string, string[]> = {
      reference: ['booking id', 'reference', 'ref', 'booking reference', 'booking_id'],
      plate: ['vehicle registration', 'plate', 'vrm', 'registration', 'car plate', 'vehicle_registration'],
      start_at: ['arrival date', 'start date', 'arrival', 'start', 'arrival_date', 'start_date'],
      end_at: ['departure date', 'end date', 'departure', 'end', 'departure_date', 'end_date'],
      customer_name: ['customer name', 'name', 'full name', 'customer', 'customer_name'],
      customer_email: ['customer email', 'email', 'e-mail', 'customer_email'],
      flight_number: ['flight number', 'flight', 'flight_number'],
      money_received: ['money received', 'paid', 'amount received', 'money_received'],
      money_charged: ['money charged', 'charge', 'price', 'cost', 'money_charged'],
      source: ['source', 'channel', 'booking source']
    };

    headers.forEach(header => {
      const normalizedHeader = header.toLowerCase().trim();
      
      // Find matching field
      for (const [field, variations] of Object.entries(headerMap)) {
        if (variations.some(variation => normalizedHeader.includes(variation))) {
          mapping[field as keyof BookingMapping] = header;
          break;
        }
      }
    });

    return mapping;
  };

  const handleFileUpload = async () => {
    if (!file) {
      setError('Please select a CSV file');
      return;
    }
    if (!tenantId) {
      setError('Please select a tenant');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/bookings/import/inspect', {
        method: 'POST',
        headers: { 'X-Tenant-Id': tenantId },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.reason || 'Upload failed');
      }

      const data = await response.json();
      setInspectResult(data);
      
      // Use suggested mapping if available and confident, otherwise fallback to auto-guess
      if (data.autoGuess.suggested && data.autoGuess.suggested.confidence >= 0.8) {
        setMapping(data.autoGuess.suggested.mapping);
        setSuggestedMappingId(data.autoGuess.suggested.id);
        setMappingName(data.autoGuess.suggested.name);
                } else {
        // Use our enhanced auto-mapping
        const autoMapping = autoMapHeaders(data.headers);
        setMapping(autoMapping);
        setSuggestedMappingId(null);
      }
      
      setStep('map');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!inspectResult) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/bookings/import/commit', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Tenant-Id': tenantId,
        },
        body: JSON.stringify({
          fileId: inspectResult.fileId,
          mapping,
          saveMapping,
          mappingName: saveMapping ? mappingName : undefined,
          suggestedMappingId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.reason || 'Import failed');
      }

      const data = await response.json();
      setResults(data.results);
      setStep('results');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSavedMapping = (savedMapping: SavedMapping) => {
    setMapping(savedMapping.mapping);
    setMappingName(savedMapping.name);
  };

  const isMappingValid = () => {
    const required = ['reference', 'plate', 'start_at', 'end_at'];
    return required.every(field => mapping[field as keyof BookingMapping]);
  };

  const renderUploadStep = () => (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-2">Import Bookings</h1>
        <p className="text-gray-600">Upload a CSV file to import booking data</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="tenant">Tenant</Label>
            <Select value={tenantId} onValueChange={setTenantId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select tenant..." />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tenants.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">
                No tenants found. Check browser console for debug info.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="file">CSV File</Label>
            <Input
              ref={fileInputRef}
              id="file"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="mt-1"
            />
          </div>

          {file && (
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-sm">
                <strong>Selected:</strong> {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            </div>
          )}

          <Button 
            onClick={handleFileUpload} 
            disabled={!file || !tenantId || loading}
            className="w-full"
          >
            {loading ? 'Analyzing...' : 'Upload & Analyze'}
          </Button>
        </div>
      </Card>

      {error && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-red-600 text-sm">{error}</p>
        </Card>
      )}
    </div>
  );

  const renderMapStep = () => {
    if (!inspectResult) return null;

    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Map CSV Columns</h1>
          <p className="text-gray-600">
            Map your CSV columns to booking fields ({inspectResult.totalRows} rows found)
          </p>
        </div>

        {/* Intelligent Suggestion Banner */}
        {inspectResult.autoGuess.suggested && (
          <Card className={`p-4 border-2 ${
            inspectResult.autoGuess.suggested.confidence >= 0.8 
              ? 'border-green-200 bg-green-50' 
              : 'border-yellow-200 bg-yellow-50'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {inspectResult.autoGuess.suggested.confidence >= 0.8 ? '✓' : '?'} 
                  Recognized Format
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  <strong>{inspectResult.autoGuess.suggested.name}</strong> 
                  ({inspectResult.autoGuess.suggested.match} match, 
                  {Math.round(inspectResult.autoGuess.suggested.confidence * 100)}% confidence)
                </p>
                {inspectResult.autoGuess.suggested.confidence < 0.8 && (
                  <p className="text-xs text-yellow-700 mt-1">
                    This looks similar but may need adjustment
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setMapping(inspectResult.autoGuess.suggested!.mapping);
                    setSuggestedMappingId(inspectResult.autoGuess.suggested!.id);
                  }}
                >
                  Use This
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMapping({
                      reference: null,
                      plate: null,
                      start_at: null,
                      end_at: null,
                    });
                    setSuggestedMappingId(null);
                  }}
                >
                  Map Manually
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Saved Mappings */}
        {inspectResult.savedMappings.length > 0 && (
          <Card className="p-4">
            <h3 className="font-semibold mb-3">Saved Mappings</h3>
            <div className="flex flex-wrap gap-2">
              {inspectResult.savedMappings.map((saved) => (
                <Badge
                  key={saved.id}
                  variant="outline"
                  className="cursor-pointer hover:bg-gray-100"
                  onClick={() => loadSavedMapping(saved)}
                >
                  {saved.name}
                </Badge>
              ))}
      </div>
          </Card>
        )}

        {/* Required Fields */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            Required Fields
            <Badge variant={isMappingValid() ? "default" : "destructive"}>
              {isMappingValid() ? "✓ Complete" : "Missing"}
            </Badge>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inspectResult.requiredFields
              .filter((field) => typeof field === 'string' && field.trim() !== '')
              .map((field) => (
              <div key={field}>
                <Label className="text-sm font-medium">
                  {field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Label>
                <Select
                  value={mapping[field as keyof BookingMapping] || '__not_mapped__'}
                  onValueChange={(value) => 
                    setMapping(prev => ({ ...prev, [field]: value === "__not_mapped__" ? null : value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__not_mapped__">Not mapped</SelectItem>
                    {inspectResult.headers
                      .filter((header) => typeof header === 'string' && header.trim() !== '')
                      .map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
        </div>
            ))}
      </div>
        </Card>

        {/* Optional Fields */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Optional Fields</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inspectResult.optionalFields
              .filter((field) => typeof field === 'string' && field.trim() !== '')
              .map((field) => (
              <div key={field}>
                <Label className="text-sm font-medium">
                  {field.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Label>
                <Select
                  value={mapping[field as keyof BookingMapping] || '__not_mapped__'}
                  onValueChange={(value) => 
                    setMapping(prev => ({ ...prev, [field]: value === "__not_mapped__" ? null : value }))
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select column..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__not_mapped__">Not mapped</SelectItem>
                    {inspectResult.headers
                      .filter((header) => typeof header === 'string' && header.trim() !== '')
                      .map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </Card>

        {/* Save Mapping */}
        <Card className="p-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="saveMapping"
              checked={saveMapping}
              onCheckedChange={(checked) => setSaveMapping(!!checked)}
            />
            <Label htmlFor="saveMapping">Save this mapping for future use</Label>
          </div>
          {saveMapping && (
            <Input
              placeholder="Mapping name (e.g., 'Holiday Extras v1')"
              value={mappingName}
              onChange={(e) => setMappingName(e.target.value)}
              className="mt-2"
            />
          )}
        </Card>

        {/* Sample Data Preview */}
        <Card className="p-6">
          <h3 className="font-semibold mb-4">Sample Data Preview</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  {inspectResult.headers.map((header) => (
                    <th key={header} className="text-left p-2 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inspectResult.sampleRows.slice(0, 5).map((row, i) => (
                  <tr key={i} className="border-b">
                    {inspectResult.headers.map((header) => (
                      <td key={header} className="p-2">
                        {row[header] || '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Actions */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={() => setStep('upload')}>
            Back
          </Button>
          <Button 
            onClick={handleCommit} 
            disabled={!isMappingValid() || loading}
            className="flex-1"
          >
            {loading ? 'Importing...' : `Import ${inspectResult.totalRows} Bookings`}
          </Button>
        </div>

        {error && (
          <Card className="p-4 border-red-200 bg-red-50">
            <p className="text-red-600 text-sm">{error}</p>
          </Card>
        )}
      </div>
    );
  };

  const renderResultsStep = () => {
    if (!results) return null;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Import Complete</h1>
          <p className="text-gray-600">Your booking data has been processed</p>
        </div>

        <Card className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {results.inserted}
                </div>
                <div className="text-sm text-green-600">Inserted</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {results.updated}
                </div>
                <div className="text-sm text-blue-600">Updated</div>
              </div>
            </div>

            {results.rejects > 0 && (
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">
                  {results.rejects}
                </div>
                <div className="text-sm text-yellow-600">Rejected</div>
                {results.rejectsFileUrl && (
                  <a
                    href={results.rejectsFileUrl}
                    className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                  >
                    Download rejects.csv
                  </a>
                )}
              </div>
            )}

            {results.sampleRejects && results.sampleRejects.length > 0 && (
              <div className="mt-6">
                <h4 className="font-semibold mb-3 text-red-600">Rejection Details (First 10):</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {results.sampleRejects.map((reject: any, index: number) => (
                    <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="font-medium text-red-800">Row {reject.row}: {reject.reason}</div>
                      {reject.error && <div className="text-sm text-red-600 mt-1">Error: {reject.error}</div>}
                      {reject.data && (
                        <div className="text-sm text-gray-600 mt-1">
                          <pre className="whitespace-pre-wrap">{JSON.stringify(reject.data, null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <div className="flex gap-4">
          <Button variant="outline" onClick={() => {
            setStep('upload');
            setFile(null);
            setInspectResult(null);
            setResults(null);
            setError(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}>
            Import Another File
          </Button>
          <Button onClick={() => window.location.href = '/admin/bookings'}>
            View Bookings
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8">
      {step === 'upload' && renderUploadStep()}
      {step === 'map' && renderMapStep()}
      {step === 'results' && renderResultsStep()}
    </div>
  );
}
