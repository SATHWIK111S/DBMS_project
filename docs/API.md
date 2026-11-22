# REST API Documentation

**Community Disaster Relief & Resource Allocation System**  
Aligned with **UN SDG 11: Sustainable Cities and Communities**

All endpoints are hosted at `/api` and expect JSON payloads unless noted as `multipart/form-data`.

---

## Authentication & Headers

| Header | Description | Example |
|---|---|---|
| `Authorization` | Supabase Auth JWT or demo token | `Bearer demo-token-coordinator` |
| `X-Demo-Role` | Direct persona role simulation header | `coordinator` \| `shelter_staff` \| `field_staff` \| `volunteer` |

---

## 1. Dashboard Module

### GET `/api/dashboard/stats`
Retrieves aggregated operational metrics. Supports optional filtering by `incident_id` and `zone_id`.

**Response (200 OK):**
```json
{
  "open_incidents": 2,
  "total_families": 6,
  "total_individuals": 29,
  "low_stock_items": 2,
  "quantities": {
    "requested": 490,
    "delivered": 60,
    "in_transit": 40,
    "unallocated": 390
  }
}
```

---

## 2. Incidents & Zones Module

### GET `/api/incidents`
Lists all logged disaster emergencies with zone and family aggregates.

**Response (200 OK):**
```json
[
  {
    "incident_id": 1,
    "incident_name": "Monsoon Flash Flood 2026",
    "incident_type": "FLOOD",
    "reported_at": "2026-11-20T07:30:00.000Z",
    "status": "ACTIVE",
    "total_zones": 3,
    "total_families": 6
  }
]
```

### POST `/api/incidents` *(Coordinator only)*
**Request Body:**
```json
{
  "incident_name": "Coastal Storm Surge 2026",
  "incident_type": "CYCLONE",
  "status": "ACTIVE"
}
```

### GET `/api/zones`
Lists affected zones with map coordinates and severity. Filter by `?incident_id=1`.

**Response (200 OK):**
```json
[
  {
    "zone_id": 1,
    "incident_id": 1,
    "zone_name": "Zone A - Riverside Lowlands",
    "latitude": 12.8715,
    "longitude": 74.8425,
    "severity": "CRITICAL",
    "family_count": 4,
    "total_individuals": 18,
    "total_requests": 2
  }
]
```

---

## 3. Affected Families Module *(Restricted to Authorized Staff)*

### GET `/api/families` *(Coordinator, Field Staff only)*
Returns individual household census records. Unauthorized roles receive `403 Forbidden`.

**Response (200 OK):**
```json
[
  {
    "family_id": 1,
    "zone_id": 1,
    "household_ref": "HH-ZA-001",
    "member_count": 4,
    "registered_at": "2026-11-21T07:00:00.000Z",
    "zone_name": "Zone A - Riverside Lowlands"
  }
]
```

### POST `/api/families`
**Request Body:**
```json
{
  "zone_id": 1,
  "household_ref": "HH-ZA-005",
  "member_count": 5
}
```

---

## 4. Shelters & Inventory Module

### GET `/api/inventory`
Lists available stock balances per shelter and supply item. Filter by `?shelter_id=1`.

**Response (200 OK):**
```json
[
  {
    "shelter_id": 1,
    "supply_id": 1,
    "shelter_name": "Shelter North (Highland Complex)",
    "item_name": "Food Kits",
    "unit": "kits",
    "available_qty": 80,
    "is_low_stock": false
  }
]
```

### POST `/api/inventory/adjust` *(Coordinator, Shelter Staff)*
Guarded stock adjustment. Creates an entry in `inventory_audits`.

**Request Body:**
```json
{
  "shelter_id": 1,
  "supply_id": 1,
  "change_qty": 50,
  "action_type": "RESTOCK"
}
```

---

## 5. Aid Requests & Dispatches Module *(Core Transactional Workflow)*

### GET `/api/requests`
Lists aid requests with calculated fulfillment progress (`delivered`, `in_transit`, `unallocated`).

**Response (200 OK):**
```json
[
  {
    "request_id": 1,
    "zone_name": "Zone A - Riverside Lowlands",
    "item_name": "Food Kits",
    "unit": "kits",
    "requested_qty": 100,
    "priority": "CRITICAL",
    "delivered_qty": 60,
    "in_transit_qty": 40,
    "unallocated_qty": 0
  }
]
```

### POST `/api/dispatches` *(Coordinator only)*
Executes atomic PostgreSQL transaction:
1. Locks request row (`SELECT FOR UPDATE`).
2. Calculates unallocated demand.
3. Validates positive quantity $\le$ unallocated demand.
4. Deducts stock with guarded update (`available_qty >= qty`).
5. Inserts dispatch with status `IN_TRANSIT`.
6. Supports idempotency key deduplication.

**Request Body:**
```json
{
  "requestId": 1,
  "shelterId": 1,
  "dispatchQty": 60,
  "volunteerIds": [1, 2],
  "idempotencyKey": "disp_benchmark_north_60"
}
```

**Response (201 Created):**
```json
{
  "message": "Dispatch created successfully in IN_TRANSIT status",
  "dispatch": {
    "dispatch_id": 1,
    "request_id": 1,
    "shelter_id": 1,
    "dispatch_qty": 60,
    "status": "IN_TRANSIT",
    "dispatched_at": "2026-11-22T08:00:00.000Z"
  },
  "balance_after": 20,
  "unallocated_demand": 40
}
```

### POST `/api/dispatches/:id/receive` *(Field Staff, Coordinator)*
Confirms physical receipt. Transitions `IN_TRANSIT` $\rightarrow$ `DELIVERED`. Safe to retry (idempotent).

**Response (200 OK):**
```json
{
  "message": "Dispatch successfully confirmed as DELIVERED.",
  "dispatch": {
    "dispatch_id": 1,
    "status": "DELIVERED",
    "received_at": "2026-11-22T08:30:00.000Z"
  },
  "already_delivered": false
}
```

### POST `/api/dispatches/:id/cancel` *(Coordinator, Shelter Staff)*
Cancels dispatch after goods are verified returned to source shelter. Restores shelter stock in same transaction. Safe to retry without double stock restoration.

**Response (200 OK):**
```json
{
  "message": "Dispatch cancelled and stock verified returned to source shelter.",
  "dispatch": {
    "dispatch_id": 2,
    "status": "CANCELLED"
  },
  "restored_stock": 55,
  "already_cancelled": false
}
```

---

## 6. Reports & SDG 11 Module

### GET `/api/reports/shortages`
Reports outstanding shortages by zone and supply item. **Strictly keeps quantities with different units separate.**

### GET `/api/reports/sdg11-metrics`
Returns operational recovery metrics evaluating SDG Target 11.5.

**Response (200 OK):**
```json
{
  "sdg_goal": "SDG 11: Sustainable Cities & Communities",
  "target": "11.5 - Substantially reduce the number of deaths and people affected by disasters",
  "metrics": {
    "registered_households_protected": 6,
    "vulnerable_individuals_assisted": 29,
    "aid_requests_logged": 5,
    "fulfillment_rate_percentage": "60%",
    "quantities_by_status": {
      "total_requested": 490,
      "delivered": 60,
      "in_transit": 40,
      "unallocated": 390
    }
  }
}
```

---

## 7. AI & Image Processing Services

### GET `/api/ai/briefing?incident_id=1`
Invokes Google Gemini to generate an advisory situational assessment from aggregate statistics. Excludes personal household names and phone numbers.

### POST `/api/ai/predict-demand`
Calls FastAPI microservice with Scikit-learn model to forecast next-day requested quantities.

**Request Body:**
```json
{
  "zone_id": 1,
  "supply_id": 1,
  "severity": "HIGH",
  "affected_households": 25,
  "past_demand_avg": 50
}
```

### POST `/api/evidence/upload` *(multipart/form-data)*
Validates photo dimensions, corrects EXIF orientation, and generates thumbnails using OpenCV.
