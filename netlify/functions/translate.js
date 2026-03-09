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

이미지 실제 크기: 가로 ${imageWidth}px, 세로 ${imageHeight}px

좌표 규칙 (매우 중요):
- x, y, w, h 는 반드시 위의 이미지 실제 픽셀 크기 기준으로 측정
- w(너비), h(높이)는 텍스트가 차지하는 실제 영역보다 20% 여유있게 크게 잡을 것
- fontSize는 원본 텍스트의 실제 픽셀 크기를 추정 (이미지 크기 대비 비율로 계산)
- 텍스트가 이미지 전체 너비에 걸쳐 있으면 w를 이미지 너비에 맞게 크게 설정
- color는 원본 텍스트 색상 HEX (#000000 형식)
- bold: 원본 굵기 기준
- align: 텍스트 정렬

JSON 배열만 반환. 다른 텍스트 없이.
[{"x":정수,"y":정수,"w":정수,"h":정수,"original":"원본중국어","translated":"자연스러운한국어","fontSize":정수,"color":"#XXXXXX","bold":false,"align":"center"}]`;

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
