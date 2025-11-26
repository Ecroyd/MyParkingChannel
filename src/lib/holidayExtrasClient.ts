// src/lib/holidayExtrasClient.ts

const SANDBOX_BASE = "https://api-sandbox.holidayextras.com";
const LIVE_BASE = "https://api.holidayextras.com";

import type { HolidayExtrasConfig } from "./tenantSecrets/holidayExtras";

export interface AirportAvailabilityParams {
  airportCode: string;      // e.g. 'LGW'
  arrivalDate: string;      // 'YYYY-MM-DD'
  arrivalTime: string;      // 'HHMM'
  departDate: string;       // 'YYYY-MM-DD'
  departTime: string;       // 'HHMM'
  numberOfPax?: number;
  outFlight?: string;
  filter?: string;          // 'on_airport' | 'meet_and_greet' | etc.
  fields?: string[];        // product info fields from Product Library
}

export interface PriceCheckParams {
  carParkCode: string;      // product code (e.g. 'LHH6')
  arrivalDate: string;
  arrivalTime: string;
  departDate: string;
  departTime: string;
  numberOfPax: number;
}

export interface BookingParams {
  carParkCode: string;
  arrivalDate: string;
  arrivalTime: string;
  departDate: string;
  departTime: string;
  numberOfPax: number;

  title: string;      // MR, MRS, etc.
  initial: string;    // T
  surname: string;    // TEST

  email: string;
  address1: string;
  town: string;
  county: string;
  postcode: string;

  priceCheckPrice: number;

  // Optional vehicle / flight details (depending on RequestFlags)
  carColour?: string;
  carMake?: string;
  carModel?: string;
  registration?: string;
  destination?: string;
  outFlight?: string;
  outTerminal?: string;
  returnFlight?: string;
  returnTerminal?: string;
  mobileNum?: string;
}

export class HolidayExtrasClient {
  private baseUrl: string;
  private cfg: HolidayExtrasConfig;

  constructor(cfg: HolidayExtrasConfig) {
    this.cfg = cfg;
    this.baseUrl = cfg.environment === "live" ? LIVE_BASE : SANDBOX_BASE;
  }

  private async generateToken(): Promise<string> {
    // TODO: implement based on their "user token" endpoint.
    // For now, assume you have an endpoint like:
    // GET /v1/token.js?ABTANumber=...&key=...
    // and extract a 9-digit token from the response.
    // We'll just throw for now so you fill it in later.
    throw new Error("generateToken() not implemented - wire to user token endpoint");
  }

  private buildUrl(path: string, query: Record<string, string | number | undefined>) {
    const url = new URL(path, this.baseUrl);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private async get(path: string, query: Record<string, string | number | undefined>) {
    const url = this.buildUrl(path, query);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json, text/javascript, */*",
      },
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Holiday Extras GET ${path} failed: ${res.status} ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text; // fallback if not JSON
    }
  }

  private async post(path: string, body: URLSearchParams) {
    const url = new URL(path, this.baseUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/javascript, */*",
      },
      body,
    });

    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Holiday Extras POST ${path} failed: ${res.status} ${text}`);
    }

    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  async airportAvailability(params: AirportAvailabilityParams) {
    const token = await this.generateToken();

    return this.get(`/v1/carpark/${params.airportCode}.js`, {
      ABTANumber: this.cfg.abtaNumber,
      Password: this.cfg.password,
      Initials: this.cfg.initials,
      key: this.cfg.apiKey,
      token,
      ArrivalDate: params.arrivalDate,
      ArrivalTime: params.arrivalTime,
      DepartDate: params.departDate,
      DepartTime: params.departTime,
      NumberOfPax: params.numberOfPax,
      OutFlight: params.outFlight,
      filter: params.filter,
      fields: params.fields?.join(","),
      System: this.cfg.system,
      lang: this.cfg.lang,
    });
  }

  async priceCheck(params: PriceCheckParams) {
    const token = await this.generateToken();

    return this.get(`/v1/carpark/${params.carParkCode}/priceCheck`, {
      ABTANumber: this.cfg.abtaNumber,
      Password: this.cfg.password,
      Initials: this.cfg.initials,
      key: this.cfg.apiKey,
      token,
      ArrivalDate: params.arrivalDate,
      ArrivalTime: params.arrivalTime,
      DepartDate: params.departDate,
      DepartTime: params.departTime,
      NumberOfPax: params.numberOfPax,
      System: this.cfg.system,
    });
  }

  async book(params: BookingParams) {
    const token = await this.generateToken();

    const body = new URLSearchParams();

    body.set("ABTANumber", this.cfg.abtaNumber);
    if (this.cfg.password) body.set("Password", this.cfg.password);
    if (this.cfg.initials) body.set("Initials", this.cfg.initials);
    body.set("key", this.cfg.apiKey);
    body.set("token", token);

    body.set("ArrivalDate", params.arrivalDate);
    body.set("ArrivalTime", params.arrivalTime);
    body.set("DepartDate", params.departDate);
    body.set("DepartTime", params.departTime);
    body.set("NumberOfPax", String(params.numberOfPax));

    body.set("Title", params.title);
    body.set("Initial", params.initial);
    body.set("Surname", params.surname);

    body.set("Email", params.email);
    body.set("Address", params.address1);
    body.set("Town", params.town);
    body.set("County", params.county);
    body.set("PostCode", params.postcode);

    body.set("PriceCheckFlag", "Y");
    body.set("PriceCheckPrice", params.priceCheckPrice.toFixed(2));

    // Optional flags
    if (params.carColour) body.set("CarColour", params.carColour);
    if (params.carMake) body.set("CarMake", params.carMake);
    if (params.carModel) body.set("CarModel", params.carModel);
    if (params.registration) body.set("Registration", params.registration);
    if (params.destination) body.set("Destination", params.destination);
    if (params.outFlight) body.set("OutFlight", params.outFlight);
    if (params.outTerminal) body.set("OutTerminal", params.outTerminal);
    if (params.returnFlight) body.set("ReturnFlight", params.returnFlight);
    if (params.returnTerminal) body.set("ReturnTerminal", params.returnTerminal);
    if (params.mobileNum) body.set("MobileNum", params.mobileNum);

    body.set("System", this.cfg.system);
    body.set("lang", this.cfg.lang);

    return this.post(`/v1/carpark/${params.carParkCode}.js`, body);
  }
}

