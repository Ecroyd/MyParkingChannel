import BookingWidgetInline from '@/components/widget/WidgetInline'

export default async function WidgetPage({ params }: { params: Promise<{ tenant_id: string }>}) {
  const { tenant_id } = await params;
  return (
    <html>
      <head>
        <title>Book Parking</title>
        <style dangerouslySetInnerHTML={{
          __html: `
            body { margin: 0; padding: 0; font-family: system-ui, -apple-system, sans-serif; }
            * { box-sizing: border-box; }
          `
        }} />
      </head>
      <body className="bg-bg">
        <div className="max-w-xl mx-auto p-4">
          <BookingWidgetInline tenantId={tenant_id} />
        </div>
      </body>
    </html>
  )
}

