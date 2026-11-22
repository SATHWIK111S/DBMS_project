import dotenv from 'dotenv';
dotenv.config();

/**
 * Generates an executive draft incident briefing from aggregate disaster data.
 * STRICT PRIVACY REQUIREMENT: Household records, names, and contact details 
 * are explicitly excluded from the prompt payload.
 */
export async function generateIncidentBriefing({ incident, zones, requestsSummary, inventoryShortages, dispatchesSummary }) {
  const apiKey = process.env.GEMINI_API_KEY;

  const aggregateContext = {
    incident_name: incident.incident_name,
    incident_type: incident.incident_type,
    incident_status: incident.status,
    total_affected_zones: zones.length,
    critical_zones: zones.filter(z => z.severity === 'CRITICAL').map(z => z.zone_name),
    high_severity_zones: zones.filter(z => z.severity === 'HIGH').map(z => z.zone_name),
    total_requested_items: requestsSummary.total_requested || 0,
    total_delivered_items: requestsSummary.total_delivered || 0,
    total_in_transit_items: requestsSummary.total_in_transit || 0,
    total_unallocated_demand: requestsSummary.total_unallocated || 0,
    critical_shortages: inventoryShortages.map(s => `${s.item_name} at ${s.shelter_name} (Current: ${s.available_qty} ${s.unit})`),
    active_dispatches_count: dispatchesSummary.in_transit_count || 0
  };

  const systemInstructions = `
You are an expert humanitarian relief logistics coordinator assistant.
Analyze the following aggregate crisis statistics and provide a concise, structured briefing.
Format the output as clean JSON with these keys:
- "summary": A 2-3 sentence executive situational assessment.
- "shortages_summary": A bulleted summary of acute supply shortages and bottleneck zones.
- "recommendations": 3-4 prioritized actionable recommendations for resource allocation and shelter transfers.

Never invent data. Focus strictly on humanitarian logistics, inventory replenishment, and delivery bottlenecks.
`;

  if (apiKey && apiKey !== 'your-gemini-api-key-here') {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `${systemInstructions}\n\nAggregate Incident Data:\n${JSON.stringify(aggregateContext, null, 2)}`
            }]
          }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const contentText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (contentText) {
          const parsed = JSON.parse(contentText);
          return {
            summary: parsed.summary,
            shortages_summary: Array.isArray(parsed.shortages_summary) ? parsed.shortages_summary.join('\n• ') : parsed.shortages_summary,
            recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations.join('\n• ') : parsed.recommendations,
            is_ai_generated: true,
            model: 'gemini-2.5-flash',
            status: 'DRAFT',
            review_required: true,
            disclaimer: 'AI-Generated Briefing. Requires Coordinator Review and Approval before operational broadcast.'
          };
        }
      }
    } catch (err) {
      console.warn('[Gemini Service] API call failed or timed out. Falling back to structured heuristic draft:', err.message);
    }
  }

  // Graceful rule-based generator ensuring high availability
  const unallocatedText = aggregateContext.total_unallocated_demand > 0
    ? `There are currently ${aggregateContext.total_unallocated_demand} units of unallocated relief demand across affected zones.`
    : `All active aid requests have either been delivered or have dispatches in transit.`;

  return {
    summary: `Operational overview for ${aggregateContext.incident_name} (${aggregateContext.incident_type}). ${aggregateContext.total_affected_zones} zones are actively monitored, with critical alert in: ${aggregateContext.critical_zones.join(', ') || 'None'}. ${unallocatedText}`,
    shortages_summary: aggregateContext.critical_shortages.length > 0
      ? `• Acute stock warning: ${aggregateContext.critical_shortages.join('\n• ')}`
      : '• No severe stock deficits recorded in primary warehouses.',
    recommendations: `• Expedite confirmation of ${aggregateContext.active_dispatches_count} in-transit relief shipments to free up transport capacity.\n• Prioritize bulk restocking of Food Kits and Potable Water from central depot.\n• Rebalance surplus blankets from low-demand sectors to riverside shelters.\n• Maintain continuous communication with field staff for family registration headcounts.`,
    is_ai_generated: true,
    model: 'heuristic-draft-engine',
    status: 'DRAFT',
    review_required: true,
    disclaimer: 'Advisory Briefing Draft. Requires Coordinator Review and Approval before operational broadcast.'
  };
}
