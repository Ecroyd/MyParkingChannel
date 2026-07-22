-- Editable Fly Parks Exeter SEO seed (does NOT activate DNS / flyparksexeter.co.uk).
-- Safe to re-run. Only uses approved known tenant facts; no invented facilities/ratings.

INSERT INTO public.site_seo_settings (
  site_id, tenant_id, website_name, alternative_site_name,
  default_title_template, default_meta_description,
  primary_language, allow_indexing, schema_business_type,
  indexing_mode, migration_target_domain, migration_notes,
  logo_url, default_robots_index, default_robots_follow
) VALUES (
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba',
  'bab45dab-19e8-4230-b18e-ee1f663608e5',
  'Fly Parks Exeter',
  'Parking Exeter Airport',
  '{page} | {site}',
  'Book Exeter Airport parking with Fly Parks Exeter.',
  'en-GB', true, 'ParkingFacility',
  'live_indexable',
  'flyparksexeter.co.uk',
  'Future primary domain: flyparksexeter.co.uk. Current live domain: parkingexeterairport.co.uk. Do not switch DNS until explicitly activated.',
  'https://eoiruumwwanyppxjtceg.supabase.co/storage/v1/object/public/tenant-assets/bab45dab-19e8-4230-b18e-ee1f663608e5/logo.png?t=1760030567299',
  true, true
)
ON CONFLICT (site_id) DO UPDATE SET
  website_name = EXCLUDED.website_name,
  alternative_site_name = EXCLUDED.alternative_site_name,
  default_title_template = EXCLUDED.default_title_template,
  default_meta_description = EXCLUDED.default_meta_description,
  migration_target_domain = EXCLUDED.migration_target_domain,
  migration_notes = EXCLUDED.migration_notes,
  logo_url = COALESCE(public.site_seo_settings.logo_url, EXCLUDED.logo_url),
  updated_at = now();

UPDATE public.tenant_public_profile SET
  business_name = COALESCE(NULLIF(business_name, ''), 'Fly Parks Exeter'),
  alternative_name = COALESCE(alternative_name, 'Parking Exeter Airport'),
  email = COALESCE(NULLIF(email, ''), 'info@flyparksexeter.co.uk'),
  website = COALESCE(website, 'https://www.parkingexeterairport.co.uk'),
  airports = COALESCE(airports, ARRAY['Exeter Airport']::text[]),
  country = COALESCE(country, 'GB'),
  business_description = COALESCE(
    business_description,
    'Fly Parks Exeter provides airport parking for travellers using Exeter Airport. Book online and manage your booking through the website.'
  ),
  about_text = COALESCE(
    about_text,
    'Fly Parks Exeter provides airport parking for travellers using Exeter Airport. Book online and manage your booking through the website.'
  ),
  faq = COALESCE(faq, jsonb_build_array(
    jsonb_build_object(
      'q', 'How do I book parking?',
      'a', 'Choose your dates on the booking form, enter your details, and complete payment. You will receive a confirmation email with your booking reference.'
    ),
    jsonb_build_object(
      'q', 'How do I manage an existing booking?',
      'a', 'Use the Manage Booking page with your booking reference and the email address used at checkout.'
    ),
    jsonb_build_object(
      'q', 'Where is Fly Parks Exeter?',
      'a', 'Use the Directions page for the map pin and What3Words location. Contact us if you need help finding the site.'
    ),
    jsonb_build_object(
      'q', 'How can I contact you?',
      'a', 'Email info@flyparksexeter.co.uk or use the Contact page.'
    )
  )),
  updated_at = now()
WHERE tenant_id = 'bab45dab-19e8-4230-b18e-ee1f663608e5';

INSERT INTO public.site_pages (
  site_id, page_key, path, title, h1, excerpt, content_md, content_json,
  seo_title, meta_description, robots_index, robots_follow,
  nav_label, nav_order, show_in_navigation, status, published_at
) VALUES
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'home', '/', 'Home',
  'Exeter Airport parking with Fly Parks Exeter',
  'Book Exeter Airport parking online with Fly Parks Exeter.',
  '',
  jsonb_build_array(
    jsonb_build_object('id','home-rich','type','rich_text','heading','Airport parking for Exeter travellers','body','Fly Parks Exeter offers online booking for travellers using Exeter Airport. Use the booking form to check availability for your travel dates.'),
    jsonb_build_object('id','home-book','type','booking_search','heading','Check availability'),
    jsonb_build_object('id','home-how','type','how_it_works','heading','How booking works','steps', jsonb_build_array(
      jsonb_build_object('title','Choose your dates','body','Enter arrival and departure dates on the booking form.'),
      jsonb_build_object('title','Complete your booking','body','Provide your details and pay securely online.'),
      jsonb_build_object('title','Manage when you need to','body','Use Manage Booking with your reference and email.')
    )),
    jsonb_build_object('id','home-cta','type','call_to_action','heading','Ready to book?','body','Check availability for your Exeter Airport trip.','ctaText','Book parking','ctaHref','/book')
  ),
  'Exeter Airport Parking | Fly Parks Exeter',
  'Book Exeter Airport parking online with Fly Parks Exeter.',
  true, true, 'Home', 0, true, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'book', '/book', 'Book',
  'Book Exeter Airport parking',
  'Check availability and book parking for Exeter Airport.',
  '', '[]'::jsonb,
  'Book Exeter Airport Parking | Fly Parks Exeter',
  'Check availability and book Exeter Airport parking with Fly Parks Exeter.',
  true, true, 'Book', 10, true, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'directions', '/directions', 'Directions',
  'Directions to Fly Parks Exeter',
  'Find Fly Parks Exeter using the map and What3Words location.',
  '',
  jsonb_build_array(
    jsonb_build_object(
      'id','dir-body','type','directions','heading','Finding the car park',
      'body','Use the map pin and What3Words location on this page to navigate to Fly Parks Exeter. If you need assistance on the day, contact us using the details on the Contact page.','mapEnabled', true
    )
  ),
  'Directions | Fly Parks Exeter',
  'Directions and map for Fly Parks Exeter airport parking.',
  true, true, 'Directions', 20, true, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'faq', '/faq', 'FAQ',
  'Frequently asked questions',
  'Answers about booking and managing Exeter Airport parking with Fly Parks Exeter.',
  '',
  jsonb_build_array(
    jsonb_build_object('id','faq-block','type','faq','heading','Common questions','items',
      jsonb_build_array(
        jsonb_build_object('q','How do I book parking?','a','Choose your dates on the booking form, enter your details, and complete payment. You will receive a confirmation email with your booking reference.'),
        jsonb_build_object('q','How do I manage an existing booking?','a','Use the Manage Booking page with your booking reference and the email address used at checkout.'),
        jsonb_build_object('q','Where is Fly Parks Exeter?','a','Use the Directions page for the map pin and What3Words location. Contact us if you need help finding the site.'),
        jsonb_build_object('q','How can I contact you?','a','Email info@flyparksexeter.co.uk or use the Contact page.')
      )
    )
  ),
  'FAQ | Fly Parks Exeter',
  'Frequently asked questions about Fly Parks Exeter airport parking.',
  true, true, 'FAQ', 30, true, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'contact', '/contact', 'Contact',
  'Contact Fly Parks Exeter',
  'Contact Fly Parks Exeter about bookings and arrivals.',
  '',
  jsonb_build_array(
    jsonb_build_object('id','contact-block','type','contact','heading','Contact details','showPhone',true,'showEmail',true,'showAddress',true,'showHours',true)
  ),
  'Contact | Fly Parks Exeter',
  'Contact Fly Parks Exeter for Exeter Airport parking enquiries.',
  true, true, 'Contact', 40, true, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'manage_booking', '/manage-booking', 'Manage Booking',
  'Manage your booking',
  'Look up and manage an existing parking booking.',
  '', '[]'::jsonb,
  'Manage Booking | Fly Parks Exeter',
  'Manage an existing Fly Parks Exeter booking.',
  false, false, 'Manage Booking', 50, true, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'checkout', '/checkout', 'Checkout',
  'Checkout', '', '', '[]'::jsonb, 'Checkout', '', false, false, null, 90, false, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'payment', '/payment', 'Payment',
  'Payment', '', '', '[]'::jsonb, 'Payment', '', false, false, null, 91, false, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'confirmation', '/success', 'Booking Confirmation',
  'Booking confirmation', '', '', '[]'::jsonb, 'Booking confirmation', '', false, false, null, 92, false, 'published', now()
),
(
  '7de22d0c-e375-4fef-90e4-dffe8537c1ba', 'customer_account', '/account', 'Account',
  'Account', '', '', '[]'::jsonb, 'Account', '', false, false, null, 93, false, 'published', now()
)
ON CONFLICT (site_id, path) DO UPDATE SET
  page_key = EXCLUDED.page_key,
  title = EXCLUDED.title,
  h1 = EXCLUDED.h1,
  excerpt = EXCLUDED.excerpt,
  content_json = EXCLUDED.content_json,
  seo_title = EXCLUDED.seo_title,
  meta_description = EXCLUDED.meta_description,
  robots_index = EXCLUDED.robots_index,
  robots_follow = EXCLUDED.robots_follow,
  nav_label = EXCLUDED.nav_label,
  nav_order = EXCLUDED.nav_order,
  show_in_navigation = EXCLUDED.show_in_navigation,
  status = EXCLUDED.status,
  updated_at = now();
