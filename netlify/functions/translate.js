exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API 키가 서버에 설정되지 않았습니다.' }) };
    }

    const { imageBase64, imageWidth, imageHeight } = JSON.parse(event.body);

    if (!imageBase64) {
      return { statusCode: 400, body: JSON.stringify({ error: '이미지가 필요합니다.' }) };
    }

    const prompt = `이 이미지에서 중국어 텍스트를 모두 찾아 한국어로 번역해주세요.

각 텍스트 영역에 대해 JSON 배열로만 반환하세요. 다른 텍스트 없이.
필드: x(좌상단X,${imageWidth}px기준,정수), y(좌상단Y,${imageHeight}px기준,정수), w(너비,정수), h(높이,정수), original(원본중국어), translated(자연스러운한국어 상세페이지 스타일), fontSize(적절한크기,정수), color(원본텍스트색상HEX), bold(true/false), align(center/left/right)

예: [{"x":10,"y":20,"w":300,"h":40,"original":"你好","translated":"안녕하세요","fontSize":24,"color":"#222222","bold":false,"align":"center"}]`;

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
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return { statusCode: response.status, body: JSON.stringify({ error: err.error?.message || 'API 오류' }) };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
