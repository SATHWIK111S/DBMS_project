import numpy as np
import pandas as pd
from datetime import datetime, timedelta

def generate_synthetic_demand_data(n_days=120, seed=42):
    """
    Generates synthetic crisis request data simulating emergency resource demand
    over a timeline across diverse zones, supply items, and severity levels.
    """
    np.random.seed(seed)
    
    start_date = datetime(2026, 1, 1)
    zones = [
        {"zone_id": 1, "zone_name": "Zone A - Riverside Lowlands", "base_pop": 450, "flood_risk": 1.8},
        {"zone_id": 2, "zone_name": "Zone B - Hillside Slopes", "base_pop": 280, "flood_risk": 1.2},
        {"zone_id": 3, "zone_name": "Zone C - Estuary Settlement", "base_pop": 520, "flood_risk": 2.1},
        {"zone_id": 4, "zone_name": "Zone D - Coastal Hamlet", "base_pop": 190, "flood_risk": 1.4}
    ]
    
    supplies = [
        {"supply_id": 1, "item_name": "Food Kits", "unit": "kits", "per_capita": 1.0},
        {"supply_id": 2, "item_name": "Blankets", "unit": "pieces", "per_capita": 1.5},
        {"supply_id": 3, "item_name": "Emergency Medical Kits", "unit": "kits", "per_capita": 0.25},
        {"supply_id": 4, "item_name": "Potable Drinking Water", "unit": "liters", "per_capita": 10.0}
    ]
    
    records = []
    
    severities = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    severity_weights = [0.2, 0.4, 0.3, 0.1]
    
    for day in range(n_days):
        current_date = start_date + timedelta(days=day)
        
        # Weather / monsoon surge wave cycle
        cyclical_wave = np.sin(day / 14.0 * np.pi) * 0.5 + 1.0
        
        for z in zones:
            severity = np.random.choice(severities, p=severity_weights)
            sev_multiplier = {"LOW": 1.0, "MEDIUM": 1.3, "HIGH": 1.8, "CRITICAL": 2.5}[severity]
            
            # Households affected vary by severity and wave
            base_households = int((z["base_pop"] / 4.2) * (sev_multiplier / 2.5) * cyclical_wave)
            affected_households = max(5, int(base_households + np.random.normal(0, 5)))
            
            for s in supplies:
                # True theoretical demand
                expected_qty = (affected_households * 3.8 * s["per_capita"] * (z["flood_risk"] / 1.5))
                # Add observational variance
                actual_requested_qty = max(2, int(expected_qty + np.random.normal(0, expected_qty * 0.12)))
                
                records.append({
                    "date": current_date.strftime("%Y-%m-%d"),
                    "day_index": day,
                    "zone_id": z["zone_id"],
                    "supply_id": s["supply_id"],
                    "severity": severity,
                    "affected_households": affected_households,
                    "requested_qty": actual_requested_qty
                })
                
    df = pd.DataFrame(records)
    
    # Sort chronologically
    df.sort_values(by=["date", "zone_id", "supply_id"], inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    # Compute lagged 3-day and 7-day past demand averages per zone and supply
    df["past_demand_avg"] = df.groupby(["zone_id", "supply_id"])["requested_qty"].transform(
        lambda s: s.shift(1).rolling(window=5, min_periods=1).mean()
    )
    df["past_demand_avg"] = df["past_demand_avg"].fillna(df["requested_qty"].mean())
    
    # Target is next-day demand
    df["next_day_demand"] = df.groupby(["zone_id", "supply_id"])["requested_qty"].shift(-1)
    df.dropna(subset=["next_day_demand"], inplace=True)
    df["next_day_demand"] = df["next_day_demand"].astype(int)
    
    return df

if __name__ == "__main__":
    df = generate_synthetic_demand_data()
    print(f"Generated {len(df)} synthetic records. Sample:")
    print(df.head())
