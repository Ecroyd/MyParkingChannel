-- Fly Parks Exeter SEO content enrichment (tenant-scoped only).
-- Uses approved on-site facts: short walk from terminal, EX5 2BD, What3Words,
-- online booking, email. Does NOT invent phone, hours, ratings, or amenities.
-- Does NOT change DNS or indexing_mode (currently staging_noindex).

-- Site SEO defaults + presentation
UPDATE public.site_seo_settings SET
  website_name = 'Fly Parks Exeter',
  alternative_site_name = 'Parking Exeter Airport',
  default_title_template = '{page} | {site}',
  default_meta_description =
    'Book direct Exeter Airport parking with Fly Parks Exeter — a short walk from the terminal. Reserve online with clear pricing.',
  schema_business_type = 'ParkingFacility',
  presentation_json = COALESCE(presentation_json, '{}'::jsonb) || jsonb_build_object(
    'heroEyebrow', 'Exeter Airport parking',
    'footerDescription',
      'Fly Parks Exeter offers direct airport parking near Exeter Airport — a short walk from the terminal. Book online and manage your booking through this website.',
    'trustPoints', jsonb_build_array(
      'Short walk from the terminal',
      'Book direct online',
      'Secure onsite parking',
      'Straightforward arrivals'
    ),
    'heroImageUrl', '/images/exeter-airport-parking-map.png',
    'heroImageAlt', 'Map showing Fly Parks Exeter relative to Exeter Airport Terminal',
    'sections', jsonb_build_object(
      'trustStrip', true,
      'howItWorks', true,
      'benefits', true,
      'location', true,
      'reviews', true,
      'faq', true,
      'finalCta', true
    )
  ),
  updated_at = now()
WHERE site_id = '7de22d0c-e375-4fef-90e4-dffe8537c1ba'
  AND tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5';

-- Local Business / profile (feeds schema.org + llms.txt)
UPDATE public.tenant_public_profile SET
  business_name = 'Fly Parks Exeter',
  alternative_name = 'Parking Exeter Airport',
  short_tagline = 'Direct Exeter Airport parking, a short walk from the terminal.',
  business_description =
    'Fly Parks Exeter provides direct airport parking near Exeter Airport (Exeter International Airport). Park onsite a short walk from the terminal, book online with clear pricing, and manage your booking through this website.',
  about_text =
    'Fly Parks Exeter is airport parking for travellers using Exeter Airport. Our car park is a short walk from the terminal at Exeter International Airport, EX5 2BD. Book directly online, arrive and park, then continue to the terminal for your flight.',
  email = COALESCE(NULLIF(email, ''), 'info@flyparksexeter.co.uk'),
  website = COALESCE(website, 'https://www.parkingexeterairport.co.uk'),
  airports = ARRAY['Exeter Airport', 'Exeter International Airport']::text[],
  country = 'GB',
  county = COALESCE(county, 'Devon'),
  address = jsonb_build_object(
    'street', 'Exeter International Airport',
    'city', 'Exeter',
    'postalCode', 'EX5 2BD',
    'county', 'Devon',
    'country', 'GB'
  ),
  what3words = COALESCE(NULLIF(what3words, ''), '///freshest.space.airports'),
  features = ARRAY[
    'Short walk from Exeter Airport terminal',
    'Book direct online',
    'Secure onsite parking',
    'Clear pricing before you pay',
    'Manage booking online'
  ]::text[],
  faq = jsonb_build_array(
    jsonb_build_object(
      'q', 'Where is Fly Parks Exeter?',
      'a', 'Fly Parks Exeter is at Exeter International Airport, Exeter, EX5 2BD — a short walk from the terminal. Use the Directions page for the map and What3Words location ///freshest.space.airports.'
    ),
    jsonb_build_object(
      'q', 'Is this parking near Exeter Airport?',
      'a', 'Yes. Fly Parks Exeter provides onsite airport parking near Exeter Airport, a short walk from the terminal.'
    ),
    jsonb_build_object(
      'q', 'How do I book Exeter Airport parking?',
      'a', 'Choose your arrival and departure dates on the booking form, enter your details, and complete payment online. You will receive a confirmation email with your booking reference.'
    ),
    jsonb_build_object(
      'q', 'Can I book direct with Fly Parks Exeter?',
      'a', 'Yes. Book directly through this website — no third-party parking marketplace required for your reservation.'
    ),
    jsonb_build_object(
      'q', 'How do I manage an existing booking?',
      'a', 'Use the Manage Booking page with your booking reference and the email address used at checkout.'
    ),
    jsonb_build_object(
      'q', 'How is pricing calculated?',
      'a', 'Pricing is shown when you check availability for your travel dates, before you pay.'
    ),
    jsonb_build_object(
      'q', 'What if my flight changes?',
      'a', 'Contact us as soon as possible with your booking reference so we can advise on your options. Email info@flyparksexeter.co.uk or use the Contact page.'
    ),
    jsonb_build_object(
      'q', 'How can I contact you?',
      'a', 'Email info@flyparksexeter.co.uk or use the Contact page on this website.'
    )
  ),
  updated_at = now()
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5';

-- Home page: stronger SEO title/description; keep proven H1; enrich blocks
UPDATE public.site_pages SET
  h1 = 'Exeter Airport Parking, Just a Short Walk from the Terminal',
  excerpt =
    'Direct Exeter Airport parking with Fly Parks Exeter — secure onsite parking, clear pricing, and a short walk to the terminal.',
  seo_title = 'Exeter Airport Parking | Direct Parking Near the Terminal | Fly Parks Exeter',
  meta_description =
    'Book direct Exeter Airport parking with Fly Parks Exeter. Onsite parking a short walk from the terminal at EX5 2BD. Clear online pricing and easy booking.',
  content_json = jsonb_build_array(
    jsonb_build_object(
      'id', 'home-hero',
      'type', 'hero',
      'enabled', true,
      'eyebrow', 'Exeter Airport parking',
      'title', 'Exeter Airport Parking, Just a Short Walk from the Terminal',
      'subtitle', 'Direct airport parking near Exeter Airport with clear online pricing and a straightforward arrival.',
      'imageUrl', '/images/exeter-airport-parking-map.png',
      'imageAlt', 'Map showing Fly Parks Exeter relative to Exeter Airport Terminal',
      'trustPoints', jsonb_build_array(
        'Short walk from the terminal',
        'Book direct online',
        'Secure onsite parking',
        'Straightforward arrivals'
      )
    ),
    jsonb_build_object(
      'id', 'home-how',
      'type', 'how_it_works',
      'heading', 'How Exeter Airport parking works',
      'steps', jsonb_build_array(
        jsonb_build_object(
          'title', 'Book online',
          'body', 'Choose your dates and complete your Fly Parks Exeter booking online in a few minutes.'
        ),
        jsonb_build_object(
          'title', 'Arrive and park',
          'body', 'Follow directions to the car park at Exeter International Airport and park in your reserved space.'
        ),
        jsonb_build_object(
          'title', 'Walk to the terminal',
          'body', 'Continue to Exeter Airport terminal — a short walk from the car park.'
        )
      )
    ),
    jsonb_build_object(
      'id', 'home-benefits',
      'type', 'benefits',
      'heading', 'Why book Exeter Airport parking with Fly Parks Exeter',
      'items', jsonb_build_array(
        jsonb_build_object(
          'icon', 'check',
          'title', 'Book direct',
          'body', 'Reserve Exeter Airport parking directly on this website with clear pricing before you pay.'
        ),
        jsonb_build_object(
          'icon', 'map',
          'title', 'Close to the terminal',
          'body', 'Park onsite near Exeter Airport — a short walk from the terminal for a simple arrival.'
        ),
        jsonb_build_object(
          'icon', 'clock',
          'title', 'Manage online',
          'body', 'Look up your booking with your reference and email whenever you need.'
        ),
        jsonb_build_object(
          'icon', 'car',
          'title', 'Straightforward arrivals',
          'body', 'Use directions, What3Words, and FAQs for a clear next step on travel day.'
        )
      )
    ),
    jsonb_build_object(
      'id', 'dir-home',
      'type', 'directions',
      'heading', 'Parking near Exeter Airport',
      'body', 'Fly Parks Exeter is at Exeter International Airport, Exeter, EX5 2BD. Use the map and What3Words ///freshest.space.airports to find the car park — a short walk from the terminal.',
      'imageUrl', '/images/exeter-airport-parking-map.png',
      'imageAlt', 'Map showing Fly Parks Exeter relative to Exeter Airport Terminal'
    ),
    jsonb_build_object(
      'id', 'faq-home',
      'type', 'faq',
      'heading', 'Exeter Airport parking FAQs',
      'items', jsonb_build_array(
        jsonb_build_object(
          'q', 'Where is Fly Parks Exeter?',
          'a', 'Fly Parks Exeter is at Exeter International Airport, Exeter, EX5 2BD — a short walk from the terminal. Use the Directions page for the map and What3Words location ///freshest.space.airports.'
        ),
        jsonb_build_object(
          'q', 'Is this parking near Exeter Airport?',
          'a', 'Yes. Fly Parks Exeter provides onsite airport parking near Exeter Airport, a short walk from the terminal.'
        ),
        jsonb_build_object(
          'q', 'How do I book Exeter Airport parking?',
          'a', 'Choose your arrival and departure dates on the booking form, enter your details, and complete payment online. You will receive a confirmation email with your booking reference.'
        ),
        jsonb_build_object(
          'q', 'Can I book direct with Fly Parks Exeter?',
          'a', 'Yes. Book directly through this website — no third-party parking marketplace required for your reservation.'
        ),
        jsonb_build_object(
          'q', 'How do I manage an existing booking?',
          'a', 'Use the Manage Booking page with your booking reference and the email address used at checkout.'
        ),
        jsonb_build_object(
          'q', 'How is pricing calculated?',
          'a', 'Pricing is shown when you check availability for your travel dates, before you pay.'
        )
      )
    ),
    jsonb_build_object(
      'id', 'home-cta',
      'type', 'call_to_action',
      'heading', 'Ready to book Exeter Airport parking?',
      'body', 'Check availability for your trip and reserve your space online with Fly Parks Exeter.',
      'ctaText', 'Book parking',
      'ctaHref', '/#booking'
    )
  ),
  updated_at = now()
WHERE site_id = '7de22d0c-e375-4fef-90e4-dffe8537c1ba'
  AND path = '/';

UPDATE public.site_pages SET
  h1 = 'Book Exeter Airport parking',
  excerpt = 'Check availability and book direct Exeter Airport parking with Fly Parks Exeter.',
  seo_title = 'Book Exeter Airport Parking Online | Fly Parks Exeter',
  meta_description =
    'Book Exeter Airport parking online with Fly Parks Exeter. Check availability, see clear pricing, and reserve your space near the terminal.',
  updated_at = now()
WHERE site_id = '7de22d0c-e375-4fef-90e4-dffe8537c1ba'
  AND path = '/book';

UPDATE public.site_pages SET
  h1 = 'Directions to Fly Parks Exeter',
  excerpt =
    'Find Fly Parks Exeter at Exeter International Airport, EX5 2BD — a short walk from the terminal.',
  seo_title = 'Directions to Exeter Airport Parking | Fly Parks Exeter',
  meta_description =
    'Directions to Fly Parks Exeter airport parking at Exeter International Airport, EX5 2BD. Map and What3Words ///freshest.space.airports.',
  content_json = jsonb_build_array(
    jsonb_build_object(
      'id', 'dir-body',
      'type', 'directions',
      'heading', 'Finding Fly Parks Exeter',
      'body',
        'Fly Parks Exeter is at Exeter International Airport, Exeter, EX5 2BD, a short walk from the terminal. Use the map pin and What3Words ///freshest.space.airports to navigate. If you need assistance on the day, email info@flyparksexeter.co.uk or use the Contact page.',
      'mapEnabled', true,
      'imageUrl', '/images/exeter-airport-parking-map.png',
      'imageAlt', 'Map showing Fly Parks Exeter relative to Exeter Airport Terminal'
    )
  ),
  updated_at = now()
WHERE site_id = '7de22d0c-e375-4fef-90e4-dffe8537c1ba'
  AND path = '/directions';

UPDATE public.site_pages SET
  h1 = 'Exeter Airport parking FAQs',
  excerpt =
    'Answers about booking, managing, and finding direct Exeter Airport parking with Fly Parks Exeter.',
  seo_title = 'Exeter Airport Parking FAQs | Fly Parks Exeter',
  meta_description =
    'FAQs for Fly Parks Exeter — booking, managing, directions, and parking near Exeter Airport terminal.',
  content_json = jsonb_build_array(
    jsonb_build_object(
      'id', 'faq-block',
      'type', 'faq',
      'heading', 'Common questions',
      'items', (
        SELECT faq FROM public.tenant_public_profile
        WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5'
      )
    )
  ),
  updated_at = now()
WHERE site_id = '7de22d0c-e375-4fef-90e4-dffe8537c1ba'
  AND path = '/faq';

UPDATE public.site_pages SET
  h1 = 'Contact Fly Parks Exeter',
  excerpt =
    'Contact Fly Parks Exeter about Exeter Airport parking bookings and arrivals.',
  seo_title = 'Contact Exeter Airport Parking | Fly Parks Exeter',
  meta_description =
    'Contact Fly Parks Exeter for Exeter Airport parking enquiries. Email info@flyparksexeter.co.uk.',
  updated_at = now()
WHERE site_id = '7de22d0c-e375-4fef-90e4-dffe8537c1ba'
  AND path = '/contact';

-- Prices page (SEO metadata for /prices route)
INSERT INTO public.site_pages (
  site_id, page_key, path, title, h1, excerpt, content_md, content_json,
  seo_title, meta_description, robots_index, robots_follow,
  nav_label, nav_order, show_in_navigation, status, published_at
) VALUES (
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba',
  'prices',
  '/prices',
  'Prices',
  'Exeter Airport parking prices',
  'See clear Exeter Airport parking pricing with Fly Parks Exeter before you book.',
  '',
  '[]'::jsonb,
  'Exeter Airport Parking Prices | Fly Parks Exeter',
  'Transparent Exeter Airport parking prices from Fly Parks Exeter. Check availability online for clear rates before you pay.',
  true,
  true,
  'Prices',
  15,
  true,
  'published',
  now()
)
ON CONFLICT (site_id, path) DO UPDATE SET
  page_key = EXCLUDED.page_key,
  title = EXCLUDED.title,
  h1 = EXCLUDED.h1,
  excerpt = EXCLUDED.excerpt,
  seo_title = EXCLUDED.seo_title,
  meta_description = EXCLUDED.meta_description,
  robots_index = EXCLUDED.robots_index,
  robots_follow = EXCLUDED.robots_follow,
  nav_label = EXCLUDED.nav_label,
  nav_order = EXCLUDED.nav_order,
  show_in_navigation = EXCLUDED.show_in_navigation,
  status = EXCLUDED.status,
  updated_at = now();
