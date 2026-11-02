/**
 * Vercel 서버리스 함수 - 레시피 생성
 * Google Gemini API를 사용하여 레시피 생성
 */

export default async function handler(req, res) {
    // CORS 헤더 설정
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    // OPTIONS 요청 처리 (CORS preflight)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // POST 요청만 허용
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt, imageBase64 } = req.body;

        // 환경변수에서 API 키 가져오기 (GEMINI_API_KEY 우선, 기존 호환 지원)
        const apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: 'Server configuration error: GEMINI_API_KEY not set'
            });
        }

        // Gemini API contents 구성
        const parts = [{ text: prompt }];

        if (imageBase64) {
            // Data URL 파싱 (예: data:image/jpeg;base64,...)
            const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
            let mimeType = 'image/jpeg';
            let base64Data = imageBase64;

            if (match) {
                mimeType = match[1];
                base64Data = match[2];
            }

            const imageSizeKB = (base64Data.length * 0.75) / 1024;
            console.log(`이미지 크기 (추정): ${imageSizeKB.toFixed(2)} KB`);

            if (imageSizeKB > 10240) {
                return res.status(400).json({
                    error: '이미지 크기가 너무 큽니다. 10MB 이하의 이미지를 사용해주세요.',
                    size: `${imageSizeKB.toFixed(2)} KB`
                });
            }

            parts.push({
                inlineData: {
                    mimeType: mimeType,
                    data: base64Data
                }
            });
        }

        const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        const requestBody = {
            contents: [
                {
                    parts: parts
                }
            ],
            generationConfig: {
                temperature: 0.7,
                topP: 0.9,
                maxOutputTokens: 2048
            }
        };

        console.log('이미지 포함:', !!imageBase64);

        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Gemini API error:', errorText);
            return res.status(response.status).json({
                error: `AI API error: ${response.status}`,
                details: errorText
            });
        }

        const data = await response.json();
        console.log('Gemini API 응답 수신 완료');

        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // 빈 응답 체크
        if (!content || content.trim() === '') {
            console.warn('AI가 빈 응답을 반환했습니다.');
            return res.status(200).json({
                success: false,
                error: 'AI가 이미지를 처리하지 못했습니다.',
                content: ''
            });
        }

        return res.status(200).json({
            success: true,
            content: content
        });

    } catch (error) {
        console.error('Server error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
}
