module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { pdfBase64 } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: 'No PDF data provided' });
    }

    const sys = `You are an expert academic advisor AI. Analyze the uploaded university degree audit PDF. Return ONLY valid JSON (no markdown, no backticks):
{"student_name":"string","university":"string","major":"string","gpa":"string","semester":"string","overall_summary":"2-3 sentence summary","total_required":number,"total_completed":number,"total_remaining":number,"categories_complete":number,"categories_total":number,"categories":[{"code":"GWS","name":"Writing and Speaking","emoji":"✍️","status":"satisfied","credits_required":9,"credits_completed":9,"credits_remaining":0,"courses_taken":["ENGL 15"],"notes":null,"recommendations":[{"course_id":"ENGL 202C","title":"Technical Writing","credits":3,"description":"Student review info","tags":["popular"],"source":"Reddit"}]}]}
Status: satisfied|in-progress|needs-work|not-started. Tags: easy|popular|useful|interesting. Only include recommendations for unsatisfied categories. Use web search for real student-recommended courses.`;

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        system: sys,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 }
            },
            {
              type: 'text',
              text: 'Analyze this degree audit. Search the web for popular student-recommended courses for any unsatisfied Gen Ed requirements. Return only JSON.'
            }
          ]
        }]
      })
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.json().catch(() => ({}));
      return res.status(anthropicRes.status).json({ error: err.error?.message || 'Anthropic API error' });
    }

    const data = await anthropicRes.json();
    let txt = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
    txt = txt.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const s = txt.indexOf('{');
    const e = txt.lastIndexOf('}');
    if (s === -1) throw new Error('No JSON in response');
    const parsed = JSON.parse(txt.substring(s, e + 1));

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};
