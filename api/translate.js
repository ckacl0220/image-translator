export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'API 키가 서버에 설정되지 않았습니다.' });
    }

    const { imageBase64, imageWidth, imageHeight } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: '이미지가 필요합니다.' });
    }

    const prompt = `Find all Chinese text in this image and translate each to Korean.

Image size: width=${imageWidth}px, height=${imageHeight}px

OUTPUT FORMAT: Return ONLY a JSON array. No explanation, no markdown, no code fences, no extra text.

Rules:
- x, y, w, h, fontSize must be plain integers (no units, no quotes)
- All string values must use double quotes
- No trailing commas anywhere
- color must be a hex string like "#333333"
- align must be one of: "left", "center", "right"
- bold must be true or false (no quotes)
- translated: natural Korean (no Chinese characters allowed)

Example of correct format:
[{"x":50,"y":100,"w":400,"h":80,"original":"中文文字","translated":"한국어 번역","fontSize":60,"color":"#222222","bold":false,"align":"center"}]

If there is no Chinese text in the image, return exactly: []`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          // prefill로 [ 를 먼저 넣어서 JSON 배열만 나오게 강제
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
              { type: 'text', text: prompt }
            ]
          },
          {
            role: 'assistant',
            content: '[' // prefill: 반드시 배열로 시작하도록 강제
          }
        ]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API 오류' });
    }

    const data = await response.json();
    let text = data.content?.[0]?.text || '';

    // prefill로 '[' 를 붙였으므로 앞에 다시 붙이기
    text = '[' + text;

    // 마크다운 코드블록 제거
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    // JSON 배열 추출 (가장 바깥 [ ] 범위)
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) {
      return res.status(200).json({ text: '[]' });
    }
    let jsonStr = text.slice(start, end + 1);

    // 흔한 JSON 오류 자동 수정
    jsonStr = jsonStr
      .replace(/,\s*([}\]])/g, '$1')           // trailing comma 제거
      .replace(/([{,]\s*)([a-zA-Z_]\w*)\s*:/g, '$1"$2":') // unquoted key 수정
      .replace(/:\s*'([^']*)'/g, ':"$1"')       // single quote → double quote
      .replace(/[\u0000-\u001F\u007F]/g, ' ');  // 제어문자 제거

    // 파싱 시도
    try {
      const arr = JSON.parse(jsonStr);
      return res.status(200).json({ text: JSON.stringify(arr) });
    } catch (e) {
      // 파싱 실패 시 객체 단위로 살려내기
      const objects = [];
      const objRx = /\{[^{}]+\}/g;
      let m;
      while ((m = objRx.exec(jsonStr)) !== null) {
        try {
          const obj = JSON.parse(m[0]);
          if (obj.translated) objects.push(obj);
        } catch (e2) { /* skip broken object */ }
      }
      if (objects.length > 0) {
        return res.status(200).json({ text: JSON.stringify(objects) });
      }
      console.error('JSON parse failed:', e.message, '\nRaw:', jsonStr.slice(0, 300));
      return res.status(200).json({ text: '[]', warning: 'parse failed' });
    }

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
