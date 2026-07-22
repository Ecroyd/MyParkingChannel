"use client";

import { useEffect, useState } from "react";
import { Star } from "lucide-react";

type ReviewItem = {
  authorName: string;
  authorUri: string | null;
  authorPhotoUri: string | null;
  rating: number | null;
  text: string;
  relativePublishTimeDescription: string | null;
};

type ApiOk = {
  success: true;
  hidden: boolean;
  reason?: string;
  mapsUrl?: string | null;
  config?: {
    heading: string;
    intro: string;
    showAggregateRating: boolean;
    showReviewCount: boolean;
    showReviewerAvatar: boolean;
    showReviewDate: boolean;
    maxReviews: number;
  };
  place?: {
    displayName: string | null;
    rating: number | null;
    userRatingCount: number | null;
    googleMapsUri: string | null;
    attributions: string[];
  };
  reviews?: ReviewItem[];
  relevanceNotice?: string;
};

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return null;
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < full ? "fill-amber-400 text-amber-400" : "text-slate-300"}`}
          aria-hidden
        />
      ))}
    </span>
  );
}

function ReviewText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp = text.length > 220;
  return (
    <div>
      <p className={`text-[15px] leading-relaxed text-slate-700 ${!expanded && needsClamp ? "line-clamp-4" : ""}`}>
        {text}
      </p>
      {needsClamp ? (
        <button
          type="button"
          className="mt-2 text-sm font-medium text-slate-800 underline-offset-2 hover:underline"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Loads Google reviews after primary homepage paint via a server proxy.
 * Never receives or stores the Places API key.
 */
export default function GoogleReviewsSection({ slug }: { slug: string }) {
  const [data, setData] = useState<ApiOk | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    (async () => {
      try {
        const res = await fetch(`/api/public/sites/${encodeURIComponent(slug)}/google-reviews`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const json = (await res.json()) as ApiOk;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData({ success: true, hidden: true, reason: "client_error" });
      } finally {
        if (!cancelled) setLoading(false);
        clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [slug]);

  if (loading) {
    return (
      <section
        aria-busy="true"
        aria-label="Loading Google reviews"
        className="border-y border-slate-200 bg-white"
      >
        <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 lg:px-8">
          <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (!data || data.hidden || !data.reviews?.length || !data.config) {
    const maps = data?.mapsUrl || data?.place?.googleMapsUri;
    if (maps) {
      return (
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-4 px-4 py-10 sm:flex-row sm:items-center sm:px-6 lg:px-8">
            <p className="text-base text-slate-600">See what travellers say on Google.</p>
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              View reviews on Google
            </a>
          </div>
        </section>
      );
    }
    return null;
  }

  const { config, place, reviews, relevanceNotice } = data;
  const mapsUrl = place?.googleMapsUri;

  return (
    <section className="border-y border-slate-200 bg-white" aria-labelledby="google-reviews-heading">
      <div className="mx-auto max-w-[1240px] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h2
              id="google-reviews-heading"
              className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-[2.125rem]"
            >
              {config.heading}
            </h2>
            {config.intro ? (
              <p className="mt-3 text-base leading-relaxed text-slate-600 sm:text-lg">
                {config.intro}
              </p>
            ) : null}
            <p className="mt-3 text-sm font-medium text-slate-500">
              {relevanceNotice || "Google reviews shown by relevance"}
            </p>
          </div>
          <div className="text-left sm:text-right">
            {config.showAggregateRating && place?.rating != null ? (
              <div className="flex items-center gap-2 sm:justify-end">
                <Stars rating={place.rating} />
                <span className="text-lg font-semibold text-slate-900">
                  {place.rating.toFixed(1)}
                </span>
              </div>
            ) : null}
            {config.showReviewCount && place?.userRatingCount != null ? (
              <p className="mt-1 text-sm text-slate-600">
                {place.userRatingCount.toLocaleString()} Google reviews
              </p>
            ) : null}
          </div>
        </div>

        <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {reviews.slice(0, config.maxReviews).map((r, i) => (
            <li
              key={`${r.authorName}-${i}`}
              className="flex flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-6"
            >
              <div className="flex items-start gap-3">
                {config.showReviewerAvatar && r.authorPhotoUri ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.authorPhotoUri}
                    alt=""
                    width={40}
                    height={40}
                    className="h-10 w-10 rounded-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
                    {r.authorName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  {r.authorUri ? (
                    <a
                      href={r.authorUri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-slate-900 hover:underline"
                    >
                      {r.authorName}
                    </a>
                  ) : (
                    <p className="font-semibold text-slate-900">{r.authorName}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Stars rating={r.rating} />
                    {config.showReviewDate && r.relativePublishTimeDescription ? (
                      <span className="text-xs text-slate-500">
                        {r.relativePublishTimeDescription}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex-1">
                <ReviewText text={r.text} />
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            Reviews from Google
            {place?.attributions?.length
              ? ` · ${place.attributions.join(" · ")}`
              : null}
          </p>
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center rounded-lg px-4 text-sm font-semibold text-white"
              style={{
                backgroundColor: "var(--tenant-action, #1e40af)",
                color: "var(--tenant-action-fg, #fff)",
              }}
            >
              Read all reviews on Google
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
