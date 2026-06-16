export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { transactions } = req.body;
  if (!transactions?.length) return res.status(400).json({ error: "No transactions" });

  const list = transactions.map(t => `${t.id}:"${t.merchant}" $${t.amount}`).join("\n");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1500,
        messages: [{
          role: "user",
          content: `For each transaction, return a JSON object with:
- category: one of Dining, Groceries, Transport, Subscriptions, Shopping, Entertainment, Health, Other
- displayName: a clean human-readable name (e.g. "ZAHAV RESTAURANT" → "Zahav", "DD *DOORDASH" → "DoorDash", "UBER *EATS" → "Uber Eats", "NJTRANSIT - WEB" → "NJ Transit", "SQ *HAPPY STAR" → "Happy Star", "ANTHROPIC* CLAUDE SUB" → "Claude Subscription")

Return ONLY a JSON object like: {"1":{"category":"Dining","displayName":"Zahav"},"2":{"category":"Transport","displayName":"Uber"}}
No markdown, no preamble.

Transactions:
${list}`
        }]
      })
    });

    const data = await response.json();
    const text = data.content?.find(b => b.type === "text")?.text || "{}";
    const cleaned = text.replace(/```json|```/g, "").trim();
    const result = JSON.parse(cleaned);
    res.status(200).json({ categories: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Enrichment failed" });
  }
}
