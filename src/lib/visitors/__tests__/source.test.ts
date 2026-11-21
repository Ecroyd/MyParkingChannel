import { describe, expect, it } from 'vitest';
import { classifySource, cleanPath, deviceFromUserAgent, hostOf, BOT_UA } from '../source';

const SITE = 'https://www.parkingexeterairport.co.uk/';

describe('classifySource', () => {
  it('treats no referrer as Direct', () => {
    expect(classifySource(SITE, '')).toEqual({ source: 'Direct', medium: 'direct', campaign: null, referrerHost: null });
  });

  it('recognises organic search', () => {
    expect(classifySource(SITE, 'https://www.google.co.uk/')).toMatchObject({ source: 'Google', medium: 'organic', referrerHost: 'google.co.uk' });
    expect(classifySource(SITE, 'https://www.bing.com/search?q=x')).toMatchObject({ source: 'Bing', medium: 'organic' });
    expect(classifySource(SITE, 'https://chatgpt.com/')).toMatchObject({ source: 'ChatGPT', medium: 'organic' });
  });

  it('recognises social sites', () => {
    expect(classifySource(SITE, 'https://m.facebook.com/')).toMatchObject({ source: 'Facebook', medium: 'social' });
    expect(classifySource(SITE, 'https://l.instagram.com/')).toMatchObject({ source: 'Instagram', medium: 'social' });
  });

  it('marks Google Ads clicks as paid even without UTM tags', () => {
    expect(classifySource(`${SITE}?gclid=abc`, 'https://www.google.com/')).toMatchObject({ source: 'Google', medium: 'paid' });
    expect(classifySource(`${SITE}?msclkid=abc`, '')).toMatchObject({ source: 'Bing', medium: 'paid' });
    expect(classifySource(`${SITE}?fbclid=abc`, '')).toMatchObject({ source: 'Facebook', medium: 'social' });
  });

  it('prefers UTM tags and keeps the campaign', () => {
    expect(
      classifySource(`${SITE}?utm_source=newsletter&utm_medium=email&utm_campaign=xmas`, 'https://mail.google.com/')
    ).toEqual({ source: 'Newsletter', medium: 'email', campaign: 'xmas', referrerHost: 'mail.google.com' });
    expect(classifySource(`${SITE}?utm_source=google&gclid=1`, '')).toMatchObject({ source: 'Google', medium: 'paid' });
  });

  it('falls back to the referring site', () => {
    expect(classifySource(SITE, 'https://www.exeter-airport.co.uk/parking')).toMatchObject({
      source: 'exeter-airport.co.uk',
      medium: 'referral',
    });
  });

  it('survives junk input', () => {
    expect(classifySource('not a url', 'also not')).toMatchObject({ source: 'Direct' });
  });
});

describe('helpers', () => {
  it('hostOf strips www and rejects junk', () => {
    expect(hostOf('https://www.Example.com/a')).toBe('example.com');
    expect(hostOf('nope')).toBeNull();
  });

  it('cleanPath drops query strings and caps length', () => {
    expect(cleanPath('/book?email=a@b.com#x')).toBe('/book');
    expect(cleanPath('prices')).toBe('/prices');
    expect(cleanPath('/' + 'a'.repeat(500))).toHaveLength(200);
  });

  it('deviceFromUserAgent', () => {
    expect(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
    expect(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Safari/537.36')).toBe('tablet');
    expect(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36')).toBe('mobile');
    expect(deviceFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBe('desktop');
  });

  it('spots bots', () => {
    expect(BOT_UA.test('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(BOT_UA.test('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15')).toBe(false);
  });
});
